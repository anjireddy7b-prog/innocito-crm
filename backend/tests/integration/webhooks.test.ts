import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import crypto from 'crypto';
import { createApp } from '@/app';
import { db } from '@/config/db';
import { webhookDeliveries } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { runDueWebhookDeliveries } from '@/modules/webhooks/webhooks.service';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 11 (API/integrations), slice 2 — outbound webhooks. Delivery (the actual outbound HTTP
// call + signing + retry/backoff) is exercised directly against runDueWebhookDeliveries(), the
// exact function webhookScheduler.ts's interval calls in production, rather than waiting on a
// live timer — createApp() never starts that timer (see webhookScheduler.ts's own comment),
// mirroring how sequences.test.ts exercises runDueSequenceSteps() directly.

let adminToken: string;
let insideSalesToken: string;
let orgBAdminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;
});

async function createLead(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyName: `Webhook Test Co ${Date.now()}-${Math.random()}`,
      contact: { firstName: 'Webhook', lastName: 'Tester', email: `webhook.${Date.now()}.${Math.random()}@example.com` },
      source: 'EMAIL',
      status: 'NEW',
      priority: 'MEDIUM',
      ...overrides,
    });
  return res;
}

describe('Webhook endpoint management — create, list, toggle, delete', () => {
  it('an ADMIN (holding WEBHOOKS_MANAGE) can create an endpoint and gets the secret back', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/crm', eventTypes: ['lead.created', 'lead.status_changed'] });
    expect(res.status).toBe(201);
    expect(res.body.data.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.eventTypes).toEqual(['lead.created', 'lead.status_changed']);
    expect(res.body.data.isActive).toBe(true);
  });

  it('rejects creating an endpoint without WEBHOOKS_MANAGE (INSIDE_SALES)', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ url: 'https://example.com/hooks/crm', eventTypes: ['lead.created'] });
    expect(res.status).toBe(403);
  });

  it('rejects an endpoint with no event types', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/crm', eventTypes: [] });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized event type', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/crm', eventTypes: ['not.a.real.event'] });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed url', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'not-a-url', eventTypes: ['lead.created'] });
    expect(res.status).toBe(400);
  });

  it('lists endpoints for the org, including the secret (unlike apiKeys, this is not a one-time reveal)', async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/list-test', eventTypes: ['lead.created'] });
    const list = await request(app).get('/api/webhooks').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((e: any) => e.id === create.body.data.id);
    expect(row).toBeTruthy();
    expect(row.secret).toBe(create.body.data.secret);
  });

  it("a different organization's endpoints are completely invisible", async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/org-a-only', eventTypes: ['lead.created'] });

    const orgBList = await request(app).get('/api/webhooks').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((e: any) => e.id)).not.toContain(create.body.data.id);

    const orgBToggle = await request(app)
      .patch(`/api/webhooks/${create.body.data.id}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ isActive: false });
    expect(orgBToggle.status).toBe(404);

    const orgBDelete = await request(app).delete(`/api/webhooks/${create.body.data.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBDelete.status).toBe(404);
  });

  it('can toggle isActive off and back on without losing url/secret/eventTypes', async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/toggle-test', eventTypes: ['lead.created'] });
    const id = create.body.data.id;

    const off = await request(app).patch(`/api/webhooks/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect(off.body.data.secret).toBe(create.body.data.secret);
    expect(off.body.data.eventTypes).toEqual(['lead.created']);

    const on = await request(app).patch(`/api/webhooks/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: true });
    expect(on.status).toBe(200);
    expect(on.body.data.isActive).toBe(true);
  });

  it('toggling a nonexistent endpoint is rejected with 404', async () => {
    const res = await request(app)
      .patch('/api/webhooks/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it('deleting an endpoint also deletes its delivery history (cascade)', async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'http://127.0.0.1:1/unreachable', eventTypes: ['lead.created'] });
    const id = create.body.data.id;

    const leadRes = await createLead(insideSalesToken);
    expect(leadRes.status).toBe(201);

    const beforeDelete = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, id));
    expect(beforeDelete.length).toBeGreaterThan(0);

    const del = await request(app).delete(`/api/webhooks/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const afterDelete = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, id));
    expect(afterDelete.length).toBe(0);
  });

  it('deleting a nonexistent endpoint is rejected with 404', async () => {
    const res = await request(app).delete('/api/webhooks/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Dispatching events onto active, subscribed endpoints only', () => {
  it('a lead-status-changed event is NOT queued for an endpoint only subscribed to lead.created', async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/created-only', eventTypes: ['lead.created'] });
    const id = create.body.data.id;

    const leadRes = await createLead(insideSalesToken);
    const leadId = leadRes.body.data.id;

    const afterCreate = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, id));
    expect(afterCreate.some((d) => d.eventType === 'lead.created')).toBe(true);

    await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ status: 'CONTACTED' });

    const afterStatusChange = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, id));
    expect(afterStatusChange.some((d) => d.eventType === 'lead.status_changed')).toBe(false);
  });

  it('a disabled (isActive=false) endpoint receives no new deliveries even if subscribed', async () => {
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/hooks/paused', eventTypes: ['lead.created'] });
    const id = create.body.data.id;
    await request(app).patch(`/api/webhooks/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });

    await createLead(insideSalesToken);

    const deliveries = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, id));
    expect(deliveries.length).toBe(0);
  });
});

describe('Delivery mechanics — real HTTP call, signature, retry/backoff', () => {
  let server: http.Server;
  let port: number;
  let received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let shouldFail = false;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        if (shouldFail) {
          res.writeHead(500);
          res.end('nope');
        } else {
          res.writeHead(200);
          res.end('ok');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delivers a real event to the endpoint with a valid HMAC signature, and marks it SUCCEEDED', async () => {
    received = [];
    shouldFail = false;
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: `http://127.0.0.1:${port}/receive`, eventTypes: ['lead.created'] });
    const { id: endpointId, secret } = create.body.data;

    const leadRes = await createLead(insideSalesToken);
    expect(leadRes.status).toBe(201);

    const { processed } = await runDueWebhookDeliveries();
    expect(processed).toBeGreaterThan(0);

    expect(received.length).toBe(1);
    const [delivery] = received;
    expect(delivery.headers['x-webhook-event']).toBe('lead.created');
    const sigHeader = delivery.headers['x-webhook-signature'] as string;
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sigHeader);
    expect(match).toBeTruthy();
    const [, ts, sig] = match!;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${ts}.${delivery.body}`).digest('hex');
    expect(sig).toBe(expectedSig);

    const payload = JSON.parse(delivery.body);
    expect(payload.event).toBe('lead.created');
    expect(payload.data.lead.id).toBe(leadRes.body.data.id);

    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, endpointId));
    expect(rows[0].status).toBe('SUCCEEDED');
    expect(rows[0].lastStatusCode).toBe(200);
  });

  it('a failing endpoint stays PENDING with a future nextAttemptAt and a recorded error, not immediately FAILED', async () => {
    received = [];
    shouldFail = true;
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: `http://127.0.0.1:${port}/receive`, eventTypes: ['lead.created'] });
    const endpointId = create.body.data.id;

    await createLead(insideSalesToken);
    const before = Date.now();
    await runDueWebhookDeliveries();

    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, endpointId));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastStatusCode).toBe(500);
    expect(rows[0].lastError).toBeTruthy();
    expect(new Date(rows[0].nextAttemptAt).getTime()).toBeGreaterThan(before);

    // Not due yet — a second tick right now must not re-attempt it.
    received = [];
    await runDueWebhookDeliveries();
    expect(received.length).toBe(0);
  });

  it('a delivery to an unreachable address fails with a network error, not an unhandled rejection', async () => {
    received = [];
    shouldFail = false;
    const create = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'http://127.0.0.1:1/unreachable', eventTypes: ['lead.created'] });
    const endpointId = create.body.data.id;

    await createLead(insideSalesToken);
    await runDueWebhookDeliveries();

    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookEndpointId, endpointId));
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastStatusCode).toBeNull();
    expect(rows[0].lastError).toBeTruthy();
  });
});
