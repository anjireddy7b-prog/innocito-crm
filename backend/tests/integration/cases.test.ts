import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_SALES, TEST_ORG_B_ADMIN, primaryRoleIds } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — case management: a post-sale support/service record, independent
// of the sales pipeline, optionally linked to a Company and/or Contact. See cases.service.ts and
// db/schema.ts's `cases`/`caseComments` comments for the full scope/design rationale. Gated on a
// single CASES_MANAGE permission (granted by default to INSIDE_SALES/SALES/DELIVERY, not
// MANAGEMENT — see utils/permissions.ts); viewing is unconditional for any authenticated org member.

let adminToken: string;
let salesToken: string;
let managementToken: string;
let orgBAdminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;

  // MANAGEMENT holds no CASES_MANAGE grant by default (see utils/permissions.ts) — the only
  // fixture role in tests/setup.ts that doesn't, so it's created fresh here to prove the
  // permission gate actually bites, rather than every fixture happening to pass it.
  const created = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'management.case-test@innocito.com', firstName: 'Case', lastName: 'Manager', roleId: primaryRoleIds.MANAGEMENT });
  const managementLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'management.case-test@innocito.com', password: created.body.data.temporaryPassword });
  managementToken = managementLogin.body.data.accessToken;
});

async function createCase(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${token}`)
    .send({ subject: 'Widget stopped working', ...overrides });
  return res.body.data;
}

describe('Case CRUD', () => {
  it('creates a case with defaults (status NEW, priority MEDIUM) and a formatted display id', async () => {
    const c = await createCase(salesToken, { subject: 'Cannot log in' });
    expect(c.status).toBe('NEW');
    expect(c.priority).toBe('MEDIUM');
    expect(c.displayId).toMatch(/^CS-\d{6}$/);
    expect(c.subject).toBe('Cannot log in');
  });

  it('rejects a case with no subject', async () => {
    const res = await request(app).post('/api/cases').set('Authorization', `Bearer ${salesToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('links a case to a company and a contact and returns their summaries', async () => {
    const companyRes = await request(app).post('/api/companies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Acme Support Co' });
    const companyId = companyRes.body.data.id;
    const contactRes = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Case', lastName: 'Reporter', companyId });
    const contactId = contactRes.body.data.id;

    const c = await createCase(salesToken, { subject: 'Billing question', companyId, contactId, priority: 'HIGH' });
    expect(c.companyId).toBe(companyId);
    expect(c.contactId).toBe(contactId);
    expect(c.company.name).toBe('Acme Support Co');
    expect(c.contact.firstName).toBe('Case');
    expect(c.priority).toBe('HIGH');
  });

  it('lists cases scoped to the caller\'s organization and supports status/priority filters', async () => {
    await createCase(salesToken, { subject: 'Filter target', priority: 'URGENT' });
    const res = await request(app).get('/api/cases?priority=URGENT').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((c: any) => c.priority === 'URGENT')).toBe(true);
    expect(res.body.data.some((c: any) => c.subject === 'Filter target')).toBe(true);
  });

  it('viewing a case requires no special permission, but creating/updating/deleting one requires CASES_MANAGE', async () => {
    const c = await createCase(salesToken, { subject: 'Permission probe' });

    const view = await request(app).get(`/api/cases/${c.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(view.status).toBe(200);

    const createAttempt = await request(app).post('/api/cases').set('Authorization', `Bearer ${managementToken}`).send({ subject: 'Nope' });
    expect(createAttempt.status).toBe(403);

    const updateAttempt = await request(app)
      .patch(`/api/cases/${c.id}`)
      .set('Authorization', `Bearer ${managementToken}`)
      .send({ priority: 'LOW' });
    expect(updateAttempt.status).toBe(403);

    const deleteAttempt = await request(app).delete(`/api/cases/${c.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it('setting status to RESOLVED then CLOSED stamps resolvedAt/closedAt; reopening clears both', async () => {
    const c = await createCase(salesToken, { subject: 'Lifecycle probe' });
    expect(c.resolvedAt).toBeNull();
    expect(c.closedAt).toBeNull();

    const resolved = await request(app).patch(`/api/cases/${c.id}`).set('Authorization', `Bearer ${salesToken}`).send({ status: 'RESOLVED' });
    expect(resolved.body.data.resolvedAt).toBeTruthy();
    expect(resolved.body.data.closedAt).toBeNull();

    const closed = await request(app).patch(`/api/cases/${c.id}`).set('Authorization', `Bearer ${salesToken}`).send({ status: 'CLOSED' });
    expect(closed.body.data.resolvedAt).toBeTruthy();
    expect(closed.body.data.closedAt).toBeTruthy();

    const reopened = await request(app).patch(`/api/cases/${c.id}`).set('Authorization', `Bearer ${salesToken}`).send({ status: 'OPEN' });
    expect(reopened.body.data.resolvedAt).toBeNull();
    expect(reopened.body.data.closedAt).toBeNull();
  });

  it('deletes a case', async () => {
    const c = await createCase(salesToken, { subject: 'To be deleted' });
    const del = await request(app).delete(`/api/cases/${c.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/cases/${c.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(404);
  });

  it("never surfaces another organization's cases", async () => {
    const c = await createCase(salesToken, { subject: 'Org A only' });
    const res = await request(app).get(`/api/cases/${c.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(res.status).toBe(404);

    const list = await request(app).get('/api/cases').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(list.body.data.some((x: any) => x.id === c.id)).toBe(false);
  });
});

describe('Case comments', () => {
  it('requires CASES_MANAGE to post a comment, but not to view the thread', async () => {
    const c = await createCase(salesToken, { subject: 'Comment probe' });

    const denied = await request(app)
      .post('/api/case-comments')
      .set('Authorization', `Bearer ${managementToken}`)
      .send({ caseId: c.id, body: 'Nope' });
    expect(denied.status).toBe(403);

    const view = await request(app).get(`/api/case-comments?caseId=${c.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(view.status).toBe(200);
  });

  it('posts, lists, and deletes a comment on a case', async () => {
    const c = await createCase(salesToken, { subject: 'Comment lifecycle' });
    const created = await request(app)
      .post('/api/case-comments')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ caseId: c.id, body: 'Called the customer back.' });
    expect(created.status).toBe(201);
    expect(created.body.data.body).toBe('Called the customer back.');

    const list = await request(app).get(`/api/case-comments?caseId=${c.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(1);

    const del = await request(app).delete(`/api/case-comments/${created.body.data.id}`).set('Authorization', `Bearer ${salesToken}`);
    expect(del.status).toBe(204);
  });

  it("a user cannot delete another user's comment without COMMENTS_MANAGE_ANY, but an Admin can", async () => {
    const c = await createCase(salesToken, { subject: 'Comment ownership probe' });
    const created = await request(app)
      .post('/api/case-comments')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ caseId: c.id, body: "Sales rep's own comment" });

    // A second CASES_MANAGE-holding user who did not author the comment and holds no
    // COMMENTS_MANAGE_ANY grant (MANAGEMENT lacks CASES_MANAGE, so we reuse the same fixed
    // fixture set differently here: admin has COMMENTS_MANAGE_ANY, so prove the *positive* case
    // with admin and the *negative* case is already covered by the ownership check itself using
    // any non-owning, non-ANY caller — INSIDE_SALES has neither CASES_MANAGE-gated posting
    // relevance here nor COMMENTS_MANAGE_ANY).
    const insideSales = await request(app).post('/api/auth/login').send({ email: 'inside.sales@innocito.com', password: 'Welcome@123' });
    const deniedDelete = await request(app)
      .delete(`/api/case-comments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${insideSales.body.data.accessToken}`);
    expect(deniedDelete.status).toBe(403);

    const allowedDelete = await request(app).delete(`/api/case-comments/${created.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(allowedDelete.status).toBe(204);
  });
});
