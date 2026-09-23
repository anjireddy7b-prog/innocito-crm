import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 11 (API/integrations), slice 3 — the third-party connector abstraction layer. This suite
// runs with TOKEN_ENCRYPTION_KEY set (vitest.config.ts sets it globally for every test file), so
// connectors.service.ts's requireEncryption() gate passes here; that gate's OFF branch (the
// "server has no encryption key configured" 400) is exercised separately, in its own isolated
// test file (connectorsEncryptionGate.test.ts), since it needs tokenEncryptionEnabled mocked to
// false — not something this shared, always-on-encryption suite can flip mid-run.

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

describe('Connector provider catalog', () => {
  it('lists the fixed provider catalog, gated the same as connector instances', async () => {
    const res = await request(app).get('/api/connectors/providers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const slack = res.body.data.find((p: any) => p.id === 'slack');
    expect(slack).toBeTruthy();
    expect(slack.configFields.some((f: any) => f.key === 'webhookUrl' && f.type === 'secret')).toBe(true);
  });

  it('rejects a caller without CONNECTORS_MANAGE', async () => {
    const res = await request(app).get('/api/connectors/providers').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Connector instance management — create, list, update, delete', () => {
  it('an ADMIN can create a connector instance; secret fields are masked back, non-secret fields are not', async () => {
    const res = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'slack', name: 'Sales Alerts', config: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/xyz', channelLabel: '#sales-alerts' } });
    expect(res.status).toBe(201);
    expect(res.body.data.config.webhookUrl).toBe('••••••••');
    expect(res.body.data.config.channelLabel).toBe('#sales-alerts');
    expect(res.body.data).not.toHaveProperty('configEnc');
    expect(res.body.data.isActive).toBe(true);
  });

  it('rejects creating an instance missing a required field', async () => {
    const res = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'slack', name: 'Missing webhook', config: { channelLabel: '#nope' } });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized providerId', async () => {
    const res = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'not-a-real-provider', name: 'Bogus', config: {} });
    expect(res.status).toBe(400);
  });

  it('rejects creating an instance without CONNECTORS_MANAGE (INSIDE_SALES)', async () => {
    const res = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ providerId: 'slack', name: 'Should not work', config: { webhookUrl: 'https://hooks.slack.com/x' } });
    expect(res.status).toBe(403);
  });

  it('lists instances for the org with masked secrets persisting across a fresh list call', async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'hubspot', name: 'HubSpot Sync', config: { accessToken: 'pat-na1-super-secret-value', portalId: '99887766' } });
    expect(create.status).toBe(201);

    const list = await request(app).get('/api/connectors').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((c: any) => c.id === create.body.data.id);
    expect(row).toBeTruthy();
    expect(row.config.accessToken).toBe('••••••••');
    expect(row.config.portalId).toBe('99887766');
  });

  it("a different organization's connector instances are completely invisible", async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'slack', name: 'Org A only', config: { webhookUrl: 'https://hooks.slack.com/orgA' } });

    const orgBList = await request(app).get('/api/connectors').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((c: any) => c.id)).not.toContain(create.body.data.id);

    const orgBUpdate = await request(app)
      .patch(`/api/connectors/${create.body.data.id}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ isActive: false });
    expect(orgBUpdate.status).toBe(404);

    const orgBDelete = await request(app).delete(`/api/connectors/${create.body.data.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBDelete.status).toBe(404);
  });

  it('can toggle isActive without touching config', async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'slack', name: 'Toggle test', config: { webhookUrl: 'https://hooks.slack.com/toggle' } });
    const id = create.body.data.id;

    const off = await request(app).patch(`/api/connectors/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect(off.body.data.config.webhookUrl).toBe('••••••••');
  });

  it('can update config, re-validated against the required fields for its (immutable) provider', async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'zoom', name: 'Zoom S2S', config: { accountId: 'acct1', clientId: 'client1', clientSecret: 'shh' } });
    const id = create.body.data.id;

    // Omitting a required NON-secret field is still rejected — only a secret field gets the
    // "blank means keep existing" treatment (see the dedicated test for that below), since the UI
    // can always redisplay and resubmit a non-secret field's real current value.
    const badUpdate = await request(app)
      .patch(`/api/connectors/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config: { clientId: 'client1', clientSecret: 'shh' } }); // missing required accountId
    expect(badUpdate.status).toBe(400);

    const goodUpdate = await request(app)
      .patch(`/api/connectors/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config: { accountId: 'acct2', clientId: 'client1', clientSecret: 'new-secret' } });
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.body.data.config.accountId).toBe('acct2');
    expect(goodUpdate.body.data.config.clientSecret).toBe('••••••••');
  });

  it('leaving a secret field blank on update keeps its existing value, rather than clearing or rejecting it', async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'zoom', name: 'Zoom keep-secret test', config: { accountId: 'acct1', clientId: 'client1', clientSecret: 'original-secret' } });
    const id = create.body.data.id;

    // Rename only, re-submitting the config with clientSecret left blank (the UI never has the
    // real value to redisplay) — this must succeed, not fail required-field validation, and must
    // not silently wipe the secret.
    const update = await request(app)
      .patch(`/api/connectors/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config: { accountId: 'acct1-renamed', clientId: 'client1', clientSecret: '' } });
    expect(update.status).toBe(200);
    expect(update.body.data.config.accountId).toBe('acct1-renamed');
    expect(update.body.data.config.clientSecret).toBe('••••••••');
  });

  it('updating a nonexistent instance is rejected with 404', async () => {
    const res = await request(app)
      .patch('/api/connectors/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it('deletes an instance', async () => {
    const create = await request(app)
      .post('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ providerId: 'slack', name: 'To delete', config: { webhookUrl: 'https://hooks.slack.com/delete-me' } });
    const id = create.body.data.id;

    const del = await request(app).delete(`/api/connectors/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/connectors').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.map((c: any) => c.id)).not.toContain(id);
  });

  it('deleting a nonexistent instance is rejected with 404', async () => {
    const res = await request(app).delete('/api/connectors/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
