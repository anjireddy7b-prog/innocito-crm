import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { TEST_ADMIN } from '../setup';

// Phase 14 (AI). Isolated in its own file (vitest.config.ts's `pool: 'forks'` runs each test file
// in its own process) specifically to flip aiEnabled back to false — every other test file relies
// on the dummy ANTHROPIC_API_KEY being set globally (see vitest.config.ts's own comment), so this
// is the one place ai.service.ts's requireAi() OFF branch gets exercised at all. Mirrors
// billingDisabledGate.test.ts's exact technique for billingEnabled.
vi.mock('@/config/env', async () => {
  const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env');
  return { ...actual, aiEnabled: false };
});

const { createApp } = await import('@/app');
const app = createApp();

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('AI actions require ANTHROPIC_API_KEY to be configured', () => {
  it('rejects generating lead insights with a clear 400 when AI is not configured', async () => {
    const res = await request(app)
      .post('/api/ai/leads/00000000-0000-0000-0000-000000000000/insights')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured/i);
  });

  it('rejects drafting an email with a clear 400 when AI is not configured', async () => {
    const res = await request(app)
      .post('/api/ai/draft-email')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructions: 'Follow up' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured/i);
  });

  it('rejects a chat message with a clear 400 when AI is not configured', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured/i);
  });
});
