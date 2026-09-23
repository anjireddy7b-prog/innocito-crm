import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice — see duplicates.service.ts's own comment for the scope decision):
// duplicate detection & merge for Companies and Contacts, computed at request time (no persisted
// candidate table), gated on the same COMPANIES_MANAGE/CONTACTS_MANAGE permissions that already
// gate delete for each entity type.

let adminToken: string;
let salesToken: string;
let orgBAdminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;
});

async function createCompany(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Acme Inc', ...overrides });
  return res.body.data;
}

async function createContact(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/contacts')
    .set('Authorization', `Bearer ${token}`)
    .send({ firstName: 'Jane', lastName: 'Doe', ...overrides });
  return res.body.data;
}

describe('Duplicate detection', () => {
  it('groups companies by normalized name, case/whitespace-insensitively', async () => {
    const a = await createCompany(adminToken, { name: 'Acme Corp' });
    const b = await createCompany(adminToken, { name: '  ACME   corp  ' });
    await createCompany(adminToken, { name: 'Totally Unrelated LLC' });

    const res = await request(app).get('/api/duplicates?entityType=COMPANY').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const group = res.body.data.find((g: any) => g.records.some((r: any) => r.id === a.id));
    expect(group).toBeTruthy();
    expect(group.matchedOn).toContain('name');
    expect(group.records.map((r: any) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(group.records).toHaveLength(2);
  });

  it('groups companies by domain/website host regardless of protocol, www, or trailing path', async () => {
    const a = await createCompany(adminToken, { name: 'Widgets USA', domain: 'widgets.com' });
    const b = await createCompany(adminToken, { name: 'Widgets International', website: 'https://www.widgets.com/about' });

    const res = await request(app).get('/api/duplicates?entityType=COMPANY').set('Authorization', `Bearer ${adminToken}`);
    const group = res.body.data.find((g: any) => g.records.some((r: any) => r.id === a.id));
    expect(group).toBeTruthy();
    expect(group.matchedOn).toContain('domain');
    expect(group.records.map((r: any) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('groups contacts by normalized email', async () => {
    const a = await createContact(adminToken, { firstName: 'Jane', lastName: 'Doe', email: 'Jane.Doe@Example.com' });
    const b = await createContact(adminToken, { firstName: 'J', lastName: 'D', email: 'jane.doe@example.com' });
    await createContact(adminToken, { firstName: 'Someone', lastName: 'Else', email: 'someone@else.com' });

    const res = await request(app).get('/api/duplicates?entityType=CONTACT').set('Authorization', `Bearer ${adminToken}`);
    const group = res.body.data.find((g: any) => g.records.some((r: any) => r.id === a.id));
    expect(group).toBeTruthy();
    expect(group.matchedOn).toContain('email');
    expect(group.records.map((r: any) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('groups contacts by normalized phone, ignoring formatting', async () => {
    const a = await createContact(adminToken, { firstName: 'Alex', lastName: 'Kim', phone: '(415) 555-0134' });
    const b = await createContact(adminToken, { firstName: 'A.', lastName: 'K.', phone: '415-555-0134' });

    const res = await request(app).get('/api/duplicates?entityType=CONTACT').set('Authorization', `Bearer ${adminToken}`);
    const group = res.body.data.find((g: any) => g.records.some((r: any) => r.id === a.id));
    expect(group).toBeTruthy();
    expect(group.matchedOn).toContain('phone');
    expect(group.records.map((r: any) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("never surfaces another organization's records", async () => {
    await createCompany(orgBAdminToken, { name: 'Shared Name Co' });
    await createCompany(adminToken, { name: 'Shared Name Co' });

    const res = await request(app).get('/api/duplicates?entityType=COMPANY').set('Authorization', `Bearer ${adminToken}`);
    // Every record in every group must belong to org A — org B's same-named company never
    // shows up here (proven indirectly: the "Shared Name Co" group this org sees has exactly the
    // one company org A itself just created, not two).
    const group = res.body.data.find((g: any) => g.records.some((r: any) => r.name === 'Shared Name Co'));
    expect(group).toBeUndefined(); // org A only created ONE "Shared Name Co" — no duplicate within org A itself
  });
});

describe('Duplicate merge', () => {
  it('a user without COMPANIES_MANAGE/CONTACTS_MANAGE cannot merge', async () => {
    const a = await createCompany(adminToken, { name: 'Merge Target Co' });
    const b = await createCompany(adminToken, { name: 'Merge Target Co' });

    const res = await request(app)
      .post('/api/duplicates/merge')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ entityType: 'COMPANY', survivorId: a.id, duplicateId: b.id });
    expect(res.status).toBe(403);
  });

  it('rejects merging a record into itself', async () => {
    const a = await createCompany(adminToken, { name: 'Self Merge Co' });
    const res = await request(app)
      .post('/api/duplicates/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'COMPANY', survivorId: a.id, duplicateId: a.id });
    expect(res.status).toBe(400);
  });

  it('404s when either company id does not exist', async () => {
    const a = await createCompany(adminToken, { name: 'Lonely Co' });
    const res = await request(app)
      .post('/api/duplicates/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'COMPANY', survivorId: a.id, duplicateId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('merging companies reassigns contacts and leads to the survivor and deletes the duplicate', async () => {
    const survivor = await createCompany(adminToken, { name: 'Keep Co' });
    const duplicate = await createCompany(adminToken, { name: 'Keep Co' });
    const contact = await createContact(adminToken, { firstName: 'On', lastName: 'Duplicate', companyId: duplicate.id });
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM', companyId: duplicate.id });
    const leadId = leadRes.body.data.id;

    const merge = await request(app)
      .post('/api/duplicates/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'COMPANY', survivorId: survivor.id, duplicateId: duplicate.id });
    expect(merge.status).toBe(200);

    const contactAfter = await request(app).get(`/api/contacts/${contact.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(contactAfter.body.data.companyId).toBe(survivor.id);

    const leadAfter = await request(app).get(`/api/leads/${leadId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(leadAfter.body.data.companyId).toBe(survivor.id);

    const duplicateAfter = await request(app).get(`/api/companies/${duplicate.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(duplicateAfter.status).toBe(404);
  });

  it('merging contacts reassigns leads to the survivor and deletes the duplicate', async () => {
    const survivor = await createContact(adminToken, { firstName: 'Keep', lastName: 'Contact' });
    const duplicate = await createContact(adminToken, { firstName: 'Keep', lastName: 'Contact' });
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM', contactId: duplicate.id });
    const leadId = leadRes.body.data.id;

    const merge = await request(app)
      .post('/api/duplicates/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'CONTACT', survivorId: survivor.id, duplicateId: duplicate.id });
    expect(merge.status).toBe(200);

    const leadAfter = await request(app).get(`/api/leads/${leadId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(leadAfter.body.data.contactId).toBe(survivor.id);

    const duplicateAfter = await request(app).get(`/api/contacts/${duplicate.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(duplicateAfter.status).toBe(404);
  });
});
