import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_SALES, TEST_ORG_B_ADMIN, primaryRoleIds } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — knowledge base: internal reference articles for reps,
// independent of Cases/Companies/etc. (deliberately not linked in this increment — see
// knowledgeBase.service.ts's module comment). Gated on a single KNOWLEDGE_BASE_MANAGE permission
// (granted by default to INSIDE_SALES/SALES/DELIVERY, not MANAGEMENT — mirrors CASES_MANAGE);
// PUBLISHED articles are visible to any authenticated org member, DRAFT ones are hidden (404) from
// callers without the permission.

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

  const created = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'management.kb-test@innocito.com', firstName: 'KB', lastName: 'Manager', roleId: primaryRoleIds.MANAGEMENT });
  const managementLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'management.kb-test@innocito.com', password: created.body.data.temporaryPassword });
  managementToken = managementLogin.body.data.accessToken;
});

async function createArticle(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/knowledge-base')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'How to reset a password', content: 'Go to Settings and click Reset.', ...overrides });
  return res.body.data;
}

describe('Knowledge base CRUD', () => {
  it('creates a DRAFT article by default', async () => {
    const a = await createArticle(salesToken);
    expect(a.status).toBe('DRAFT');
    expect(a.publishedAt).toBeNull();
  });

  it('rejects an article with no title or content', async () => {
    const res = await request(app).post('/api/knowledge-base').set('Authorization', `Bearer ${salesToken}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('creates a PUBLISHED article with publishedAt stamped immediately', async () => {
    const a = await createArticle(salesToken, { status: 'PUBLISHED', category: 'Billing', tags: ['invoices', 'refunds'] });
    expect(a.status).toBe('PUBLISHED');
    expect(a.publishedAt).toBeTruthy();
    expect(a.category).toBe('Billing');
    expect(a.tags).toEqual(['invoices', 'refunds']);
  });

  it('creating/updating/deleting requires KNOWLEDGE_BASE_MANAGE', async () => {
    const a = await createArticle(salesToken, { status: 'PUBLISHED' });

    const createAttempt = await request(app).post('/api/knowledge-base').set('Authorization', `Bearer ${managementToken}`).send({ title: 'Nope', content: 'Nope' });
    expect(createAttempt.status).toBe(403);

    const updateAttempt = await request(app).patch(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${managementToken}`).send({ title: 'Hacked' });
    expect(updateAttempt.status).toBe(403);

    const deleteAttempt = await request(app).delete(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it('a PUBLISHED article is visible to any authenticated user, a DRAFT is hidden (404) without KNOWLEDGE_BASE_MANAGE', async () => {
    const published = await createArticle(salesToken, { status: 'PUBLISHED' });
    const draft = await createArticle(salesToken, { status: 'DRAFT' });

    const viewPublished = await request(app).get(`/api/knowledge-base/${published.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(viewPublished.status).toBe(200);

    const viewDraft = await request(app).get(`/api/knowledge-base/${draft.id}`).set('Authorization', `Bearer ${managementToken}`);
    expect(viewDraft.status).toBe(404);

    const viewDraftAsAuthor = await request(app).get(`/api/knowledge-base/${draft.id}`).set('Authorization', `Bearer ${salesToken}`);
    expect(viewDraftAsAuthor.status).toBe(200);
  });

  it('listing never surfaces DRAFT articles to a caller without KNOWLEDGE_BASE_MANAGE', async () => {
    await createArticle(salesToken, { title: 'Draft-only article', status: 'DRAFT' });
    const res = await request(app).get('/api/knowledge-base?pageSize=100').set('Authorization', `Bearer ${managementToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((a: any) => a.status === 'PUBLISHED')).toBe(true);
  });

  it('publishing a DRAFT stamps publishedAt; unpublishing clears it', async () => {
    const a = await createArticle(salesToken);
    const published = await request(app).patch(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${salesToken}`).send({ status: 'PUBLISHED' });
    expect(published.body.data.publishedAt).toBeTruthy();

    const unpublished = await request(app).patch(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${salesToken}`).send({ status: 'DRAFT' });
    expect(unpublished.body.data.publishedAt).toBeNull();
  });

  it('filters by category and search', async () => {
    await createArticle(salesToken, { title: 'Unique Onboarding Guide', status: 'PUBLISHED', category: 'Onboarding' });
    const byCategory = await request(app).get('/api/knowledge-base?category=Onboarding').set('Authorization', `Bearer ${adminToken}`);
    expect(byCategory.body.data.some((a: any) => a.title === 'Unique Onboarding Guide')).toBe(true);

    const bySearch = await request(app).get('/api/knowledge-base?search=Unique%20Onboarding').set('Authorization', `Bearer ${adminToken}`);
    expect(bySearch.body.data.some((a: any) => a.title === 'Unique Onboarding Guide')).toBe(true);
  });

  it('deletes an article', async () => {
    const a = await createArticle(salesToken, { status: 'PUBLISHED' });
    const del = await request(app).delete(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(404);
  });

  it("never surfaces another organization's articles", async () => {
    const a = await createArticle(salesToken, { title: 'Org A only', status: 'PUBLISHED' });
    const res = await request(app).get(`/api/knowledge-base/${a.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(res.status).toBe(404);

    const list = await request(app).get('/api/knowledge-base').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(list.body.data.some((x: any) => x.id === a.id)).toBe(false);
  });
});
