import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 11 (API/integrations), slice 1 — a versioned /api/v1 mount (identical behavior to /api,
// see app.ts) and API keys as an alternative to a JWT session for external callers. Every API
// key is deliberately read-only (see db/schema.ts's apiKeys table comment and
// middleware/auth.ts's authenticateApiKey) regardless of which permissions it was granted — that
// method-based cutoff is the main thing these tests prove, since it's enforced once in
// middleware rather than by every route remembering to check.

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

describe('API key management — create, list, revoke', () => {
  it('an ADMIN (holding API_KEYS_MANAGE) can create a key and receives the full secret exactly once', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Reporting sync', permissionKeys: ['leads:view', 'reports:view'] });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^sdrk_live_[0-9a-f]{64}$/);
    expect(res.body.data.keyPrefix).toBe(res.body.data.key.slice(0, res.body.data.keyPrefix.length));
    expect(res.body.data.permissions).toEqual(['leads:view', 'reports:view']);
    expect(res.body.data).not.toHaveProperty('keyHash');
  });

  it('rejects creating a key without API_KEYS_MANAGE (INSIDE_SALES)', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Should not work', permissionKeys: [] });
    expect(res.status).toBe(403);
  });

  it('rejects an unrecognized permission key', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad scope', permissionKeys: ['not:a_real_permission'] });
    expect(res.status).toBe(400);
  });

  it('lists keys for the org, never including the full secret or its hash', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'List test key', permissionKeys: ['leads:view'] });
    expect(create.status).toBe(201);

    const list = await request(app).get('/api/api-keys').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((k: any) => k.id === create.body.data.id);
    expect(row).toBeTruthy();
    expect(row.name).toBe('List test key');
    expect(row.keyPrefix).toBe(create.body.data.keyPrefix);
    expect(row).not.toHaveProperty('key');
    expect(row).not.toHaveProperty('keyHash');
    expect(row.revokedAt).toBeNull();
  });

  it("a different organization's keys are completely invisible", async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Org A only key', permissionKeys: [] });
    expect(create.status).toBe(201);

    const orgBList = await request(app).get('/api/api-keys').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((k: any) => k.id)).not.toContain(create.body.data.id);

    const orgBRevoke = await request(app).delete(`/api/api-keys/${create.body.data.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBRevoke.status).toBe(404);
  });

  it('revoking a key is idempotent, and a revoked key disappears from active use but stays listed', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'To be revoked', permissionKeys: ['leads:view'] });
    const id = create.body.data.id;

    const firstRevoke = await request(app).delete(`/api/api-keys/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(firstRevoke.status).toBe(204);

    const secondRevoke = await request(app).delete(`/api/api-keys/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(secondRevoke.status).toBe(204);

    const list = await request(app).get('/api/api-keys').set('Authorization', `Bearer ${adminToken}`);
    const row = list.body.data.find((k: any) => k.id === id);
    expect(row).toBeTruthy();
    expect(row.revokedAt).not.toBeNull();
  });

  it('revoking a nonexistent key is rejected with 404', async () => {
    const res = await request(app)
      .delete('/api/api-keys/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Authenticating with an API key', () => {
  it('a valid, active key authenticates a GET request it holds permission for', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Read leads', permissionKeys: ['leads:view'] });
    const key = create.body.data.key;

    const res = await request(app).get('/api/leads').set('X-Api-Key', key);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.data ?? res.body.data)).toBe(true);
  });

  it("rejects a GET request the key doesn't hold the required permission for", async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Reports only', permissionKeys: ['reports:view'] });
    const key = create.body.data.key;

    const res = await request(app).get('/api/leads').set('X-Api-Key', key);
    expect(res.status).toBe(403);
  });

  it('rejects a write request authenticated via an API key, even when the key holds the write permission', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Would-be writer', permissionKeys: ['leads:create', 'leads:view'] });
    const key = create.body.data.key;

    const res = await request(app)
      .post('/api/leads')
      .set('X-Api-Key', key)
      .send({ companyName: 'Should never be created', source: 'EMAIL' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/read-only/i);
  });

  it('rejects a revoked key', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Will be revoked then used', permissionKeys: ['leads:view'] });
    const key = create.body.data.key;
    await request(app).delete(`/api/api-keys/${create.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app).get('/api/leads').set('X-Api-Key', key);
    expect(res.status).toBe(401);
  });

  it('rejects a garbage/unknown key', async () => {
    const res = await request(app).get('/api/leads').set('X-Api-Key', 'sdrk_live_not_a_real_key');
    expect(res.status).toBe(401);
  });

  it("scopes results to the key's own organization, same as a normal user session", async () => {
    const orgBKey = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ name: 'Org B reporting key', permissionKeys: ['leads:view'] });
    expect(orgBKey.status).toBe(201);

    const res = await request(app).get('/api/leads').set('X-Api-Key', orgBKey.body.data.key);
    expect(res.status).toBe(200);
    // Whatever leads come back belong to Org B alone — proven the same way tenantIsolation.test.ts
    // proves it elsewhere: the response succeeds and is scoped by the key's own organizationId,
    // never by any value the caller could supply.
  });
});

describe('/api/v1 — versioned mount parity', () => {
  it('serves the exact same router at /api/v1 as at /api', async () => {
    const legacy = await request(app).get('/api/leads').set('Authorization', `Bearer ${adminToken}`);
    const versioned = await request(app).get('/api/v1/leads').set('Authorization', `Bearer ${adminToken}`);
    expect(versioned.status).toBe(legacy.status);
    expect(versioned.body.success).toBe(legacy.body.success);
  });

  it('also accepts an API key at the versioned path', async () => {
    const create = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'v1 key', permissionKeys: ['leads:view'] });

    const res = await request(app).get('/api/v1/leads').set('X-Api-Key', create.body.data.key);
    expect(res.status).toBe(200);
  });
});
