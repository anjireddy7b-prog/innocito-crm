import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { count, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, leads, subscriptions } from '@/db/schema';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES, primaryOrgId, primaryRoleIds } from '../setup';

// Phase 12 (billing/subscriptions). This file exercises the "configured" path — vitest.config.ts
// sets dummy STRIPE_* env vars globally, so billingEnabled is true here — by mocking the `stripe`
// package itself rather than ever making a real network call. billingDisabledGate.test.ts
// (isolated in its own file, same technique as connectorsEncryptionGate.test.ts) covers the
// opposite "not configured" 400 path.
const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
const mockPortalSessionsCreate = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockConstructEvent = vi.fn();

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: { create: mockCustomersCreate },
      checkout: { sessions: { create: mockCheckoutSessionsCreate } },
      billingPortal: { sessions: { create: mockPortalSessionsCreate } },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
      webhooks: { constructEvent: mockConstructEvent },
    })),
  };
});

const { createApp } = await import('@/app');
const app = createApp();

let adminToken: string;
let insideSalesToken: string;
let salesToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Billing plan catalog', () => {
  it('GET /billing/plans returns the fixed FREE/PRO/ENTERPRISE catalog', async () => {
    const res = await request(app).get('/api/billing/plans').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
  });

  it('a role without BILLING_MANAGE (SALES, by default) cannot view the plan catalog', async () => {
    const res = await request(app).get('/api/billing/plans').set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Billing summary', () => {
  it('lazily creates a FREE subscription on first lookup, with usage counted against it', async () => {
    const res = await request(app).get('/api/billing/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.subscription.planId).toBe('FREE');
    expect(res.body.data.subscription.status).toBe('ACTIVE');
    expect(res.body.data.subscription.hasStripeCustomer).toBe(false);
    expect(res.body.data.plan.id).toBe('FREE');
    // seedMinimal() (tests/setup.ts) creates exactly 3 users (ADMIN/INSIDE_SALES/SALES) for the
    // primary org.
    expect(res.body.data.usage.users.used).toBe(3);
    expect(res.body.data.usage.users.limit).toBe(10);
  });
});

describe('Checkout sessions', () => {
  it('creates a Stripe customer + checkout session for a plan with a configured Price ID, and returns its url', async () => {
    mockCustomersCreate.mockResolvedValue({ id: 'cus_test_123' });
    mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });

    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${adminToken}`).send({ planId: 'PRO' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://checkout.stripe.com/session_abc');
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.objectContaining({ email: TEST_ADMIN.email }));
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'subscription', customer: 'cus_test_123', client_reference_id: primaryOrgId })
    );

    // The Stripe customer id is now persisted, so a second checkout doesn't create a new customer.
    const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.organizationId, primaryOrgId) });
    expect(sub?.stripeCustomerId).toBe('cus_test_123');
  });

  it('reuses the existing Stripe customer id on a subsequent checkout rather than creating a new one', async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_xyz' });
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${adminToken}`).send({ planId: 'PRO' });
    expect(res.status).toBe(200);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_test_123' }));
  });

  it('rejects checking out into FREE (no self-serve checkout for it)', async () => {
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${adminToken}`).send({ planId: 'FREE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no self-serve checkout/i);
  });

  it('rejects an unknown planId at the validation layer', async () => {
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${adminToken}`).send({ planId: 'NOT_A_PLAN' });
    expect(res.status).toBe(400);
  });

  it('a role without BILLING_MANAGE cannot start a checkout', async () => {
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${insideSalesToken}`).send({ planId: 'PRO' });
    expect(res.status).toBe(403);
  });
});

describe('Billing portal', () => {
  it('opens a portal session using the org’s existing Stripe customer id', async () => {
    mockPortalSessionsCreate.mockResolvedValue({ url: 'https://billing.stripe.com/portal_abc' });
    const res = await request(app).post('/api/billing/portal').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://billing.stripe.com/portal_abc');
    expect(mockPortalSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_test_123' }));
  });
});

describe('Stripe webhook handling', () => {
  it('rejects a webhook whose signature fails verification', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });
    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'bad').send('{}');
    expect(res.status).toBe(400);
  });

  it('checkout.session.completed syncs the plan, status, and period end from the Stripe subscription', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: primaryOrgId, subscription: 'sub_test_1', customer: 'cus_test_123' } },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_1',
      customer: 'cus_test_123',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_dummy_pro' }, current_period_end: periodEnd }] },
    });

    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'valid').send('{}');
    expect(res.status).toBe(200);

    const summary = await request(app).get('/api/billing/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(summary.body.data.subscription.planId).toBe('PRO');
    expect(summary.body.data.subscription.status).toBe('ACTIVE');
    expect(summary.body.data.subscription.currentPeriodEnd).toBeTruthy();
  });

  it('invoice.paid records an invoice visible via GET /billing/invoices', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_1',
          customer: 'cus_test_123',
          amount_due: 4900,
          amount_paid: 4900,
          currency: 'usd',
          status: 'paid',
          hosted_invoice_url: 'https://invoice.stripe.com/in_test_1',
          period_start: Math.floor(Date.now() / 1000) - 86400,
          period_end: Math.floor(Date.now() / 1000),
        },
      },
    });

    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'valid').send('{}');
    expect(res.status).toBe(200);

    const invoicesRes = await request(app).get('/api/billing/invoices').set('Authorization', `Bearer ${adminToken}`);
    expect(invoicesRes.status).toBe(200);
    const invoice = invoicesRes.body.data.find((i: any) => i.stripeInvoiceId === 'in_test_1');
    expect(invoice).toBeTruthy();
    expect(invoice.amountPaidCents).toBe(4900);
    expect(invoice.status).toBe('paid');
  });

  it('invoice.payment_failed marks the subscription PAST_DUE', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_2',
          customer: 'cus_test_123',
          amount_due: 4900,
          amount_paid: 0,
          currency: 'usd',
          status: 'open',
          hosted_invoice_url: null,
          period_start: null,
          period_end: null,
        },
      },
    });

    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'valid').send('{}');
    expect(res.status).toBe(200);

    const summary = await request(app).get('/api/billing/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(summary.body.data.subscription.status).toBe('PAST_DUE');
  });

  it('customer.subscription.deleted downgrades the org back to FREE', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_test_1', customer: 'cus_test_123' } },
    });

    const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'valid').send('{}');
    expect(res.status).toBe(200);

    const summary = await request(app).get('/api/billing/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(summary.body.data.subscription.planId).toBe('FREE');
    expect(summary.body.data.subscription.status).toBe('CANCELED');
  });
});

describe('Plan usage limits', () => {
  it('enforceUserLimit blocks creating another user once the plan’s maxUsers is reached', async () => {
    // 3 users already exist for the primary org (seedMinimal); bulk-insert the rest directly so
    // this test doesn't need 7 real HTTP round-trips just to reach the FREE plan's limit of 10.
    const passwordHash = await argon2.hash('Filler@123');
    await db.insert(users).values(
      Array.from({ length: 7 }, (_, i) => ({
        organizationId: primaryOrgId,
        email: `filler-user-${i}@test-org.example`,
        firstName: 'Filler',
        lastName: `User${i}`,
        roleId: primaryRoleIds.SALES,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      }))
    );

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'one.too.many@test-org.example', firstName: 'One', lastName: 'TooMany', roleId: primaryRoleIds.SALES });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/limited to 10 users/i);
  });

  it('enforceLeadLimit blocks creating another lead once the plan’s maxLeads is reached', async () => {
    // Bulk-insert directly up to the FREE plan's 250-lead limit — an integration test creating
    // 250 leads one HTTP call at a time would be needlessly slow for exercising the same check
    // already unit-covered above for users.
    const [{ value: existing }] = await db.select({ value: count() }).from(leads).where(eq(leads.organizationId, primaryOrgId));
    const remaining = 250 - Number(existing);
    if (remaining > 0) {
      await db.insert(leads).values(Array.from({ length: remaining }, () => ({ organizationId: primaryOrgId })));
    }

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ source: 'EMAIL', status: 'NEW', priority: 'HIGH' });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/limited to 250 leads/i);
  });
});
