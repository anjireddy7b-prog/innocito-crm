import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/config/db';
import { leads } from '@/db/schema';
import { formatLeadNumber } from '@/utils/leadNumber';

// Phase 14 (AI), conversational CRM assistant. Every tool here is read-only and org-scoped by
// construction — each function takes the caller's `org` (never trusts anything the model itself
// supplies for tenant scoping) and returns plain, already-serialized JSON the model can reason
// over. There is no write tool: the assistant can look things up and suggest actions in its
// reply, but it can never itself create/edit/delete a lead — see ai.service.ts's runChat for the
// bounded tool-use loop these are called from.

const OPEN_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION'] as const;

export const AI_TOOLS = [
  {
    name: 'list_leads',
    description:
      "List this organization's leads, optionally filtered by status, most recently updated first. Use this to answer questions like \"what leads are in negotiation\" or \"show me new leads.\"",
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'Optional lead status to filter by (e.g. NEW, CONTACTED, QUALIFIED, PROPOSAL_SENT, NEGOTIATION, WON, LOST, DISQUALIFIED). Omit to list across all statuses.',
        },
        limit: { type: 'number', description: 'Max leads to return, default 10, max 25.' },
      },
    },
  },
  {
    name: 'get_pipeline_summary',
    description:
      'Get an aggregate count of open, won, and lost leads, broken down by pipeline status. Use this for "how is the pipeline doing" / "what does our funnel look like" style questions rather than listing individual leads.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_lead_detail',
    description:
      "Get full detail (contact, company, deal value, status, priority, next step, any AI insights already generated) for one specific lead by its lead number (e.g. 42 for lead #42) or its UUID.",
    input_schema: {
      type: 'object' as const,
      properties: {
        leadIdentifier: { type: 'string', description: 'The lead number (digits only, e.g. "42") or the lead UUID.' },
      },
      required: ['leadIdentifier'],
    },
  },
] as const;

export type AiToolName = (typeof AI_TOOLS)[number]['name'];

function summarizeLead(l: typeof leads.$inferSelect) {
  return {
    id: l.id,
    displayId: formatLeadNumber(l.leadNumber),
    status: l.status,
    priority: l.priority,
    dealValue: l.dealValue,
    currency: l.currency,
    category: l.category,
    nextSteps: l.nextSteps,
    aiNextStep: l.aiNextStep,
    aiScore: l.aiScore,
  };
}

async function listLeadsTool(org: string, input: { status?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const where = input.status
    ? and(eq(leads.organizationId, org), eq(leads.isActive, true), eq(leads.status, input.status as any))
    : and(eq(leads.organizationId, org), eq(leads.isActive, true));
  const rows = await db.query.leads.findMany({ where, orderBy: desc(leads.updatedAt), limit });
  return { leads: rows.map(summarizeLead) };
}

async function getPipelineSummaryTool(org: string) {
  const [openRows, statusRows] = await Promise.all([
    db.select({ value: count() }).from(leads).where(and(eq(leads.organizationId, org), eq(leads.isActive, true), inArray(leads.status, [...OPEN_STATUSES]))),
    db.select({ status: leads.status, value: count() }).from(leads).where(and(eq(leads.organizationId, org), eq(leads.isActive, true))).groupBy(leads.status),
  ]);
  return {
    openLeads: Number(openRows[0]?.value ?? 0),
    byStatus: statusRows.map((r) => ({ status: r.status, count: Number(r.value) })),
  };
}

async function getLeadDetailTool(org: string, input: { leadIdentifier: string }) {
  const raw = input.leadIdentifier?.trim();
  if (!raw) throw new Error('leadIdentifier is required');
  const isNumeric = /^\d+$/.test(raw);
  const lead = await db.query.leads.findFirst({
    where: isNumeric
      ? and(eq(leads.organizationId, org), eq(leads.leadNumber, Number(raw)))
      : and(eq(leads.organizationId, org), eq(leads.id, raw)),
    with: {
      company: { columns: { id: true, name: true, industry: true } },
      contact: { columns: { id: true, firstName: true, lastName: true, email: true } },
      assignedTo: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!lead) return { found: false };
  return {
    found: true,
    lead: {
      ...summarizeLead(lead),
      company: lead.company?.name ?? null,
      contact: lead.contact ? `${lead.contact.firstName} ${lead.contact.lastName}` : null,
      assignedTo: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : null,
      emailResponse: lead.emailResponse,
      aiSummary: lead.aiSummary,
    },
  };
}

/** Dispatches one tool_use block by name. Throws are caught by the caller and turned into a
 * `is_error` tool_result, per Anthropic's own tool-use error-handling convention, so a bad model-
 * generated input (e.g. an unparseable leadIdentifier) surfaces back to the model as feedback it
 * can react to, rather than aborting the whole conversation. */
export async function runAiTool(org: string, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name as AiToolName) {
    case 'list_leads':
      return listLeadsTool(org, input as { status?: string; limit?: number });
    case 'get_pipeline_summary':
      return getPipelineSummaryTool(org);
    case 'get_lead_detail':
      return getLeadDetailTool(org, input as { leadIdentifier: string });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
