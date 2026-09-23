import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { TEST_ADMIN } from '../setup';

// Phase 12 (billing/subscriptions). Isolated in its own file (vitest.config.ts's `pool: 'forks'`
// runs each test file in its own process) specifically to flip billingEnabled back to false —
// every other test file relies on the dummy STRIPE_* vars being set globally (see
// vitest.config.ts's own comment), so this is the one place billing.service.ts's requireBilling()
// OFF branch gets exercised at all. Mirrors connectorsEncryptionGate.test.ts's exact technique for
// tokenEncryptionEnabled.
vi.mock('@/config/env', async () => {
  const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env');
  return { ...actual, billingEnabled: false };
});

const { createApp } = await import('@/app');
const app = createApp();

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('Billing actions require STRIPE_SECRET_KEY to be configured', () => {
  it('rejects starting a checkout with a clear 400 when Stripe is not configured', async () => {
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${adminToken}`).send({ planId: 'PRO' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/STRIPE_SECRET_KEY/);
  });

  it('rejects opening the billing portal with a clear 400 when Stripe is not configured', async () => {
    const res = await request(app).post('/api/billing/portal').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/STRIPE_SECRET_KEY/);
  });

  it('the billing summary still works and reports billingEnabled: false, keeping every org on FREE', async () => {
    const res = await request(app).get('/api/billing/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.billingEnabled).toBe(false);
    expect(res.body.data.plan.id).toBe('FREE');
  });

  it('the Stripe webhook endpoint rejects with a clear 400 when Stripe is not configured', async () => {
    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 't=1,v1=x').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/STRIPE_SECRET_KEY/);
  });
});
