import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 1 multi-tenancy: prove Customer A cannot access Customer B's data (master prompt
// section 64) end-to-end through the real HTTP API — never a 403 (which would confirm the
// resource exists), always the same "not found" / empty result a tenant sees for a resource
// that simply doesn't exist.

let orgAToken: string; // TEST_ADMIN, seeded under primaryOrgId
let orgBToken: string; // TEST_ORG_B_ADMIN, seeded under secondaryOrgId

// Resources created under org A by the tests below, used to probe org B's access to them.
let orgALeadId: string;
let orgACompanyId: string;
let orgAContactId: string;
let orgACampaignId: string;
const ORG_A_COMPANY_NAME = 'Tenant A Only Corp';

// A resource created under org B, used to probe org A's access to it (the reverse direction).
let orgBLeadId: string;

beforeAll(async () => {
  const orgA = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  orgAToken = orgA.body.data.accessToken;
  const orgB = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBToken = orgB.body.data.accessToken;

  const leadRes = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${orgAToken}`)
    .send({
      companyName: ORG_A_COMPANY_NAME,
      contact: { firstName: 'Alice', lastName: 'OrgA', email: 'alice.orga@tenantaonly.com' },
      source: 'EMAIL',
      status: 'NEW',
      priority: 'HIGH',
    });
  expect(leadRes.status).toBe(201);
  orgALeadId = leadRes.body.data.id;
  orgACompanyId = leadRes.body.data.company.id;
  orgAContactId = leadRes.body.data.contact.id;

  const campaignsRes = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${orgAToken}`);
  expect(campaignsRes.status).toBe(200);
  expect(campaignsRes.body.data.length).toBeGreaterThan(0);
  orgACampaignId = campaignsRes.body.data[0].id;

  const orgBLeadRes = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${orgBToken}`)
    .send({
      companyName: 'Tenant B Only Corp',
      contact: { firstName: 'Bob', lastName: 'OrgB', email: 'bob.orgb@tenantbonly.com' },
      source: 'EMAIL',
      status: 'NEW',
      priority: 'HIGH',
    });
  expect(orgBLeadRes.status).toBe(201);
  orgBLeadId = orgBLeadRes.body.data.id;
});

describe('Tenant isolation — Leads', () => {
  it("org B's lead list never includes org A's lead", async () => {
    const res = await request(app).get('/api/leads?limit=200').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((l: any) => l.id === orgALeadId)).toBe(false);
  });

  it("org B searching by org A's own company name finds nothing", async () => {
    const res = await request(app)
      .get(`/api/leads?search=${encodeURIComponent('Tenant A Only')}`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it("org B gets 404 (not 403) fetching org A's lead by id", async () => {
    const res = await request(app).get(`/api/leads/${orgALeadId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("org B gets 404 updating org A's lead", async () => {
    const res = await request(app)
      .patch(`/api/leads/${orgALeadId}`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ priority: 'CRITICAL' });
    expect(res.status).toBe(404);
  });

  it("org B gets 404 changing org A's lead status", async () => {
    const res = await request(app)
      .patch(`/api/leads/${orgALeadId}/status`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ status: 'WON' });
    expect(res.status).toBe(404);
  });

  it("org B gets 404 assigning org A's lead", async () => {
    const res = await request(app)
      .patch(`/api/leads/${orgALeadId}/assign`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ currentOwnerId: null });
    expect(res.status).toBe(404);
  });

  it("bulk-assign from org B silently drops org A's lead id instead of touching it", async () => {
    const res = await request(app)
      .post('/api/leads/bulk-assign')
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ leadIds: [orgALeadId], currentOwnerId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);

    // Confirm org A's lead was genuinely untouched, from org A's own point of view.
    const check = await request(app).get(`/api/leads/${orgALeadId}`).set('Authorization', `Bearer ${orgAToken}`);
    expect(check.status).toBe(200);
  });

  it("org B gets 404 deleting org A's lead", async () => {
    const res = await request(app).delete(`/api/leads/${orgALeadId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("org A's lead list never includes org B's lead (reverse direction)", async () => {
    const res = await request(app).get('/api/leads?limit=200').set('Authorization', `Bearer ${orgAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((l: any) => l.id === orgBLeadId)).toBe(false);
  });

  it("org A gets 404 (not 403) fetching org B's lead by id", async () => {
    const res = await request(app).get(`/api/leads/${orgBLeadId}`).set('Authorization', `Bearer ${orgAToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — Companies & Contacts', () => {
  it("org B gets 404 fetching org A's company", async () => {
    const res = await request(app).get(`/api/companies/${orgACompanyId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("org B's company list never includes org A's company", async () => {
    const res = await request(app).get('/api/companies?limit=200').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: any) => c.id === orgACompanyId)).toBe(false);
  });

  it("org B gets 404 updating org A's company", async () => {
    const res = await request(app)
      .patch(`/api/companies/${orgACompanyId}`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ industry: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it("org B gets 404 deleting org A's company", async () => {
    const res = await request(app).delete(`/api/companies/${orgACompanyId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("org B gets 404 fetching org A's contact", async () => {
    const res = await request(app).get(`/api/contacts/${orgAContactId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("org B's contact list never includes org A's contact", async () => {
    const res = await request(app).get('/api/contacts?limit=200').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: any) => c.id === orgAContactId)).toBe(false);
  });
});

describe('Tenant isolation — Campaigns', () => {
  it("org B's campaign list never includes org A's seeded campaign", async () => {
    const res = await request(app).get('/api/campaigns?limit=200').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: any) => c.id === orgACampaignId)).toBe(false);
  });

  it("org B gets 404 fetching org A's campaign by id", async () => {
    const res = await request(app).get(`/api/campaigns/${orgACampaignId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — Global search', () => {
  it("org B searching org A's unique company name finds nothing across any category", async () => {
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('Tenant A Only')}`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.leads.length).toBe(0);
    expect(res.body.data.companies.length).toBe(0);
    expect(res.body.data.contacts.length).toBe(0);
  });

  it("org A can find its own company via search", async () => {
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('Tenant A Only')}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.companies.some((c: any) => c.id === orgACompanyId)).toBe(true);
  });
});

describe('Tenant isolation — Dashboard summary', () => {
  it("org B's dashboard totals never reflect org A's lead", async () => {
    const [orgASummary, orgBSummary] = await Promise.all([
      request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${orgAToken}`),
      request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${orgBToken}`),
    ]);
    expect(orgASummary.status).toBe(200);
    expect(orgBSummary.status).toBe(200);
    // Org A has at least the lead created above; org B's own count (its 1 lead) must not be
    // inflated by org A's data, i.e. the two totals are independent, not shared/cached together.
    expect(orgASummary.body.data.kpis.totalLeads).toBeGreaterThanOrEqual(1);
    expect(orgBSummary.body.data.kpis.totalLeads).toBe(1);
  });
});
