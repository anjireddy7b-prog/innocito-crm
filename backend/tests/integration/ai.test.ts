import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { leads } from '@/db/schema';
import { TEST_ADMIN, TEST_INSIDE_SALES, primaryOrgId } from '../setup';

// Phase 14 (AI). This file exercises the "configured" path — vitest.config.ts sets a dummy
// ANTHROPIC_API_KEY globally, so aiEnabled is true here — by mocking the `@anthropic-ai/sdk`
// package itself rather than ever making a real network call, exactly the same technique
// billing.test.ts uses for `stripe`. aiDisabledGate.test.ts (isolated in its own file, same
// "mock @/config/env" technique as billingDisabledGate.test.ts) covers the opposite "not
// configured" 400 path.
const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockMessagesCreate },
    })),
  };
});

const { createApp } = await import('@/app');
const app = createApp();

let adminToken: string;
let insideSalesToken: string;
let leadId: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;

  const [lead] = await db
    .insert(leads)
    .values({ organizationId: primaryOrgId, status: 'QUALIFIED', dealValue: '5000', emailResponse: "Interested, let's talk pricing." })
    .returning();
  leadId = lead.id;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/leads/:id/insights', () => {
  it('generates insights via a forced tool call and persists them on the lead', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'record_lead_insights',
          input: { summary: 'Strong buying signal after pricing question.', nextStep: 'Send a proposal within 24 hours.', score: 82 },
        },
      ],
      stop_reason: 'tool_use',
    });

    const res = await request(app).post(`/api/ai/leads/${leadId}/insights`).set('Authorization', `Bearer ${insideSalesToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.aiSummary).toBe('Strong buying signal after pricing question.');
    expect(res.body.data.aiNextStep).toBe('Send a proposal within 24 hours.');
    expect(res.body.data.aiScore).toBe(82);
    expect(res.body.data.aiInsightsGeneratedAt).toBeTruthy();

    const updated = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    expect(updated?.aiSummary).toBe('Strong buying signal after pricing question.');
    expect(updated?.aiScore).toBe(82);
    expect(updated?.aiInsightsGeneratedAt).toBeTruthy();

    // The tool call forced the model's hand (tool_choice), and the prompt handed over is built
    // from the lead's own data — spot-check that the deal's own detail actually reached the model.
    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'record_lead_insights' });
    expect(callArgs.messages[0].content).toContain("Interested, let's talk pricing.");
  });

  it('clamps an out-of-range score into 0-100', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu_2', name: 'record_lead_insights', input: { summary: 'x', nextStep: 'y', score: 140 } }],
      stop_reason: 'tool_use',
    });
    const res = await request(app).post(`/api/ai/leads/${leadId}/insights`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.aiScore).toBe(100);
  });

  it('404s for a lead that does not exist', async () => {
    const res = await request(app)
      .post('/api/ai/leads/00000000-0000-0000-0000-000000000000/insights')
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/ai/draft-email', () => {
  it('drafts a subject/body pair from free-text instructions', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu_3', name: 'record_email_draft', input: { subject: 'Quick question, {{firstName}}', body: 'Hi {{firstName}}, following up...' } }],
      stop_reason: 'tool_use',
    });
    const res = await request(app)
      .post('/api/ai/draft-email')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ instructions: 'Follow up after a demo', sequenceName: 'Onboarding', stepNumber: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe('Quick question, {{firstName}}');
    expect(res.body.data.body).toContain('firstName');
  });

  it('rejects missing instructions with a validation error', async () => {
    const res = await request(app).post('/api/ai/draft-email').set('Authorization', `Bearer ${insideSalesToken}`).send({});
    expect(res.status).toBe(400);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/chat', () => {
  it('answers directly when the model needs no tool call', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello! How can I help with your pipeline today?' }],
      stop_reason: 'end_turn',
    });
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toMatch(/pipeline/);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('runs a tool call then returns the model\'s follow-up text reply', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_4', name: 'get_pipeline_summary', input: {} }],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'You have several open leads in your pipeline.' }],
        stop_reason: 'end_turn',
      });
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ messages: [{ role: 'user', content: 'how is my pipeline doing' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBe('You have several open leads in your pipeline.');
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);

    // The second call must carry the tool_result back, scoped to this caller's own org — proves
    // the tool loop actually executed the real, org-scoped tool rather than faking a reply.
    const secondCallArgs = mockMessagesCreate.mock.calls[1][0];
    const lastMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
  });

  it('rejects an empty messages array', async () => {
    const res = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${insideSalesToken}`).send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('is reachable by an ADMIN too (AI_FEATURES_USE is covered by ALL_PERMISSIONS)', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sure, happy to help.' }],
      stop_reason: 'end_turn',
    });
    const res = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${adminToken}`).send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
  });
});
