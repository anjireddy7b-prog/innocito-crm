import { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/config/db';
import { leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { aiEnabled } from '@/config/env';
import { getAiClient, AI_MODEL } from '@/utils/aiClient';
import { AI_TOOLS, runAiTool } from './ai.tools';

function requireAi() {
  if (!aiEnabled) throw ApiError.badRequest('AI features are not configured for this deployment');
}

// ---------------------------------------------------------------------------------------------
// Lead insights & scoring (Phase 14, capabilities a + b combined into one LLM round-trip — the
// score is just another field of the same "look at this lead and tell me what you think" call,
// not a separate prompt/request; there is no reason to pay for two model calls when one already
// has to read the whole lead's context to produce either answer).
// ---------------------------------------------------------------------------------------------

const INSIGHTS_TOOL_NAME = 'record_lead_insights';

function buildLeadContext(lead: any): string {
  const lines: string[] = [];
  lines.push(`Lead ${lead.displayId ?? lead.id} — status ${lead.status}, priority ${lead.priority}.`);
  if (lead.company?.name) lines.push(`Company: ${lead.company.name}${lead.company.industry ? ` (${lead.company.industry})` : ''}.`);
  if (lead.contact) lines.push(`Contact: ${lead.contact.firstName} ${lead.contact.lastName}${lead.contact.designation ? `, ${lead.contact.designation}` : ''}.`);
  if (lead.dealValue) lines.push(`Deal value: ${lead.dealValue} ${lead.currency}.`);
  if (lead.category) lines.push(`Category: ${lead.category}.`);
  lines.push(`Source: ${lead.source}.`);
  if (lead.expectedCloseDate) lines.push(`Expected close: ${lead.expectedCloseDate}.`);
  if (lead.emailResponse) lines.push(`Latest email response from prospect: ${lead.emailResponse}`);
  if (lead.mom) lines.push(`Minutes of last meeting: ${lead.mom}`);
  if (lead.nextSteps) lines.push(`Rep's own next-step note: ${lead.nextSteps}`);
  if (lead.lossReason) lines.push(`Loss reason: ${lead.lossReason}`);

  const recentMeetings = (lead.meetings ?? []).slice(0, 5);
  if (recentMeetings.length) {
    lines.push('Recent meetings:');
    for (const m of recentMeetings) lines.push(`- [${m.status}] ${m.title} (${m.type}) on ${m.scheduledAt}${m.outcome ? `: ${m.outcome}` : ''}`);
  }

  const openTasks = (lead.tasks ?? []).filter((t: any) => !['COMPLETED', 'CANCELLED'].includes(t.status)).slice(0, 5);
  if (openTasks.length) {
    lines.push('Open tasks:');
    for (const t of openTasks) lines.push(`- ${t.title} (due ${t.dueDate ?? 'no date'})`);
  }

  const recentComments = (lead.leadComments ?? []).slice(0, 5);
  if (recentComments.length) {
    lines.push('Recent internal comments:');
    for (const c of recentComments) lines.push(`- ${c.user ? `${c.user.firstName}: ` : ''}${c.body}`);
  }

  const recentActivities = (lead.activities ?? []).slice(0, 10);
  if (recentActivities.length) {
    lines.push('Recent activity log:');
    for (const a of recentActivities) lines.push(`- ${a.description}`);
  }

  return lines.join('\n');
}

export async function generateLeadInsights(req: Request, leadId: string) {
  requireAi();
  const org = orgId(req);

  // Deliberately a fresh, full-context load rather than reusing leads.service.ts's getLeadById
  // (which also computes _count and the displayId string) — this only needs the raw relations the
  // prompt is built from, and pulling them directly here keeps this module decoupled from the
  // leads module's own response-shaping concerns.
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.organizationId, org), eq(leads.id, leadId)),
    with: {
      company: { columns: { id: true, name: true, industry: true } },
      contact: { columns: { id: true, firstName: true, lastName: true, designation: true } },
      meetings: { orderBy: (m, { desc }) => desc(m.scheduledAt), limit: 5 },
      tasks: { orderBy: (t, { asc }) => asc(t.dueDate), limit: 10 },
      leadComments: { orderBy: (c, { desc }) => desc(c.createdAt), limit: 5, with: { user: { columns: { firstName: true } } } },
      activities: { orderBy: (a, { desc }) => desc(a.createdAt), limit: 10 },
    },
  });
  if (!lead) throw ApiError.notFound('Lead not found');

  const context = buildLeadContext(lead);
  const client = getAiClient();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system:
      'You are a sales-operations assistant embedded in a CRM. You are given the full context ' +
      'for one sales lead. Call the record_lead_insights tool exactly once with your analysis. ' +
      'Be concrete and specific to the details given — never generic boilerplate. summary is 2-3 ' +
      'sentences describing where this deal stands right now. nextStep is one concrete, actionable ' +
      'recommendation for what the rep should do next. score is 0-100, your estimate of the ' +
      'likelihood this lead converts to a won deal, informed by engagement signals, deal stage, ' +
      'and anything concerning (e.g. a loss reason, a stalled status, no recent activity).',
    messages: [{ role: 'user', content: context }],
    tools: [
      {
        name: INSIGHTS_TOOL_NAME,
        description: 'Record your analysis of this lead.',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '2-3 sentence summary of where this deal stands.' },
            nextStep: { type: 'string', description: 'One concrete, actionable next step for the rep.' },
            score: { type: 'integer', minimum: 0, maximum: 100, description: 'Likelihood (0-100) this converts to a won deal.' },
          },
          required: ['summary', 'nextStep', 'score'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: INSIGHTS_TOOL_NAME },
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw ApiError.internal('AI did not return the expected structured response');
  const { summary, nextStep, score } = toolUse.input as { summary: string; nextStep: string; score: number };
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const generatedAt = new Date();

  await db
    .update(leads)
    .set({ aiSummary: summary, aiNextStep: nextStep, aiScore: clampedScore, aiInsightsGeneratedAt: generatedAt })
    .where(and(eq(leads.organizationId, org), eq(leads.id, leadId)));

  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'Lead',
    entityId: leadId,
    newValues: { aiSummary: summary, aiNextStep: nextStep, aiScore: clampedScore },
  });

  return { aiSummary: summary, aiNextStep: nextStep, aiScore: clampedScore, aiInsightsGeneratedAt: generatedAt };
}

// ---------------------------------------------------------------------------------------------
// Email / sequence-step drafting assistant (Phase 14, capability c). Stateless — no DB row is
// read or written here; the caller (SequenceStepFormDialog.tsx's "Draft with AI" button) drops
// the result straight into the subject/body fields it already owns, and only persists anything
// once the rep hits the dialog's own Save.
// ---------------------------------------------------------------------------------------------

const DRAFT_TOOL_NAME = 'record_email_draft';

export async function draftSequenceEmail(
  req: Request,
  input: { instructions: string; sequenceName?: string; stepNumber?: number }
) {
  requireAi();
  const client = getAiClient();

  const contextLines = [`Write one outbound sales email for a sequence step.`];
  if (input.sequenceName) contextLines.push(`Sequence: "${input.sequenceName}".`);
  if (input.stepNumber) contextLines.push(`This is step ${input.stepNumber} of the sequence.`);
  contextLines.push(`Instructions from the rep: ${input.instructions}`);
  contextLines.push(
    'The email may use {{firstName}}, {{company}}, {{contactFirstName}} as merge-field placeholders where natural — do not invent other placeholder syntax.'
  );

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 700,
    system:
      'You write concise, natural-sounding B2B sales outreach emails. Call the ' +
      'record_email_draft tool exactly once. Keep the body under 150 words, one clear call to ' +
      'action, no corporate filler, no subject-line clickbait.',
    messages: [{ role: 'user', content: contextLines.join('\n') }],
    tools: [
      {
        name: DRAFT_TOOL_NAME,
        description: 'Record the drafted email.',
        input_schema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Email subject line.' },
            body: { type: 'string', description: 'Email body.' },
          },
          required: ['subject', 'body'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: DRAFT_TOOL_NAME },
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw ApiError.internal('AI did not return the expected structured response');
  return toolUse.input as { subject: string; body: string };
}

// ---------------------------------------------------------------------------------------------
// Conversational CRM assistant (Phase 14, capability d). Deliberately stateless server-side — no
// chat history table, no persisted session. The client resends the full visible transcript on
// every turn (see ai.validation.ts's chatSchema); this is an MVP-scoped choice (see the top-level
// architecture note from this phase's planning), not a technical limitation of the tool-use loop
// itself, which would work identically against a persisted history later.
// ---------------------------------------------------------------------------------------------

const MAX_TOOL_ITERATIONS = 5;

export async function runAiChat(req: Request, messages: { role: 'user' | 'assistant'; content: string }[]) {
  requireAi();
  const org = orgId(req);
  const client = getAiClient();

  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system:
        'You are a CRM assistant. You can look up leads and pipeline data for the ' +
        "user's organization using the tools provided. Only answer using data you looked up " +
        "with a tool — never guess at numbers or lead details. If a question isn't about this " +
        "organization's CRM data, say so briefly and decline. Keep replies short and to the point.",
      messages: conversation,
      tools: AI_TOOLS as unknown as Anthropic.Tool[],
    });

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: text || "I don't have a response for that." };
    }

    conversation.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      try {
        const result = await runAiTool(org, block.name, block.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: err instanceof Error ? err.message : 'Tool execution failed',
        });
      }
    }
    conversation.push({ role: 'user', content: toolResults });
  }

  // Bounded-iteration safety valve — should be very rare in practice given only 3 simple
  // read-only tools, but a model that keeps calling tools forever must never hang the request.
  return { reply: "I wasn't able to finish looking that up — could you narrow down your question?" };
}
