import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_SALES, TEST_ORG_B_ADMIN, primaryRoleIds } from '../setup';

const app = createApp();

// Global search (search.routes.ts) — Phase 9's "search hardening" slice added Cases and
// Knowledge Base articles to the same instant-search endpoint that already covered Leads,
// Companies, Contacts, Campaigns, and assignable Users. This file only exercises the two new
// result groups and the visibility rule specific to them; the pre-existing five groups have no
// dedicated coverage of their own to extend (they predate this file).

let salesToken: string; // has CASES_MANAGE and KNOWLEDGE_BASE_MANAGE (see permissions.ts)
let managementToken: string; // has neither
let orgBAdminToken: string;

let caseSubject: string;
let publishedTitle: string;
let draftTitle: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  const adminToken = admin.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;

  const created = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'management.search-test@innocito.com', firstName: 'Search', lastName: 'Manager', roleId: primaryRoleIds.MANAGEMENT });
  const managementLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'management.search-test@innocito.com', password: created.body.data.temporaryPassword });
  managementToken = managementLogin.body.data.accessToken;

  const stamp = Date.now().toString(36);
  caseSubject = `Zephyr onboarding blocker ${stamp}`;
  const caseRes = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${salesToken}`)
    .send({ subject: caseSubject });
  expect(caseRes.status).toBe(201);

  publishedTitle = `Zephyr rollout guide ${stamp}`;
  const publishedRes = await request(app)
    .post('/api/knowledge-base')
    .set('Authorization', `Bearer ${salesToken}`)
    .send({ title: publishedTitle, content: 'How to roll out Zephyr to a new team.', status: 'PUBLISHED' });
  expect(publishedRes.status).toBe(201);

  draftTitle = `Zephyr internal draft notes ${stamp}`;
  const draftRes = await request(app)
    .post('/api/knowledge-base')
    .set('Authorization', `Bearer ${salesToken}`)
    .send({ title: draftTitle, content: 'Unfinished notes, not ready to share yet.' });
  expect(draftRes.status).toBe(201);
});

describe('Global search — Cases and Knowledge Base', () => {
  it('rejects a query shorter than 2 characters', async () => {
    const res = await request(app).get('/api/search?q=a').set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(400);
  });

  it('finds a case by subject substring', async () => {
    const res = await request(app).get(`/api/search?q=${encodeURIComponent(caseSubject.slice(0, 20))}`).set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.cases.some((c: any) => c.subject === caseSubject)).toBe(true);
    expect(res.body.data.cases[0].displayId).toMatch(/^CS-\d{6}$/);
  });

  it('a PUBLISHED article is visible to a caller without KNOWLEDGE_BASE_MANAGE', async () => {
    const res = await request(app).get(`/api/search?q=${encodeURIComponent(publishedTitle.slice(0, 20))}`).set('Authorization', `Bearer ${managementToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.knowledgeArticles.some((a: any) => a.title === publishedTitle)).toBe(true);
  });

  it('a DRAFT article is hidden from a caller without KNOWLEDGE_BASE_MANAGE', async () => {
    const res = await request(app).get(`/api/search?q=${encodeURIComponent(draftTitle.slice(0, 20))}`).set('Authorization', `Bearer ${managementToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.knowledgeArticles.some((a: any) => a.title === draftTitle)).toBe(false);
  });

  it('a DRAFT article is visible to a caller with KNOWLEDGE_BASE_MANAGE', async () => {
    const res = await request(app).get(`/api/search?q=${encodeURIComponent(draftTitle.slice(0, 20))}`).set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.knowledgeArticles.some((a: any) => a.title === draftTitle)).toBe(true);
  });

  it("does not leak another organization's case or article", async () => {
    const caseSearch = await request(app).get(`/api/search?q=${encodeURIComponent(caseSubject.slice(0, 20))}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(caseSearch.body.data.cases.length).toBe(0);

    const articleSearch = await request(app).get(`/api/search?q=${encodeURIComponent(publishedTitle.slice(0, 20))}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(articleSearch.body.data.knowledgeArticles.length).toBe(0);
  });
});
