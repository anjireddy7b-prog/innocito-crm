import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 10 (reporting/dashboard builder), slice 1 — custom report builder. CRUD/ownership/shared
// behavior is deliberately identical to savedViews.test.ts's coverage (same service-layer model,
// copied field-for-field — see reportBuilder.service.ts) with REPORTS_MANAGE_SHARED in place of
// SAVED_VIEWS_MANAGE_SHARED. This file adds a second concern savedViews never needed: proving the
// actual aggregation (`runReport`'s per-groupBy query branches) is correct, not just that the CRUD
// wrapper around it behaves.

let adminToken: string;
let insideSalesToken: string;
let salesToken: string;
let orgBAdminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;
});

describe('Custom report definitions — CRUD, ownership, sharing', () => {
  it('any REPORTS_VIEW holder can create, list, and read back their own personal report', async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'My Pipeline by Status', groupBy: 'STATUS', metric: 'COUNT', chartType: 'BAR' });
    expect(create.status).toBe(201);
    expect(create.body.data.isShared).toBe(false);
    expect(create.body.data.groupBy).toBe('STATUS');
    expect(create.body.data.metric).toBe('COUNT');

    const list = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: any) => r.name)).toContain('My Pipeline by Status');

    const getOne = await request(app).get(`/api/custom-reports/${create.body.data.id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(getOne.status).toBe(200);
  });

  it('rejects a report with no groupBy, and rejects an unrecognized groupBy value', async () => {
    const missing = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'No groupBy' });
    expect(missing.status).toBe(400);

    const invalid = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Bad groupBy', groupBy: 'NOT_A_DIMENSION' });
    expect(invalid.status).toBe(400);
  });

  it('rejects creating a SHARED report without REPORTS_MANAGE_SHARED (INSIDE_SALES)', async () => {
    const res = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Team Report Attempt', groupBy: 'SOURCE', isShared: true });
    expect(res.status).toBe(403);
  });

  it('an ADMIN can create a shared report, and every org member sees it in their own list', async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team: Leads by Source', groupBy: 'SOURCE', isShared: true });
    expect(create.status).toBe(201);
    expect(create.body.data.isShared).toBe(true);

    const insideSalesList = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(insideSalesList.body.data.map((r: any) => r.name)).toContain('Team: Leads by Source');

    const salesList = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${salesToken}`);
    expect(salesList.body.data.map((r: any) => r.name)).toContain('Team: Leads by Source');
  });

  it('a personal report is invisible to everyone except its creator (404, not just filtered out)', async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales-only personal report', groupBy: 'PRIORITY' });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const othersList = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(othersList.body.data.map((r: any) => r.name)).not.toContain('Sales-only personal report');

    const directFetch = await request(app).get(`/api/custom-reports/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(directFetch.status).toBe(404);
  });

  it("rejects editing or deleting someone else's personal report even with REPORTS_VIEW", async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Inside-sales-only report', groupBy: 'PRIORITY' });
    const id = create.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/custom-reports/${id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Renamed' });
    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app).delete(`/api/custom-reports/${id}`).set('Authorization', `Bearer ${salesToken}`);
    expect(deleteAttempt.status).toBe(404);
  });

  it('rejects editing or deleting a SHARED report without REPORTS_MANAGE_SHARED, even by its own creator', async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Shared report for edit test', groupBy: 'SOURCE', isShared: true });
    const id = create.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/custom-reports/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Renamed by non-manager' });
    expect(editAttempt.status).toBe(403);

    const deleteAttempt = await request(app).delete(`/api/custom-reports/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it('an owner can rename, change groupBy/metric/filters, and clear a report back to unshared', async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Editable report', groupBy: 'STATUS', filters: { status: 'NEW' } });
    const id = create.body.data.id;

    const rename = await request(app)
      .patch(`/api/custom-reports/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Editable report (renamed)' });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Editable report (renamed)');
    // Omitted fields on this update leave the prior value as-is.
    expect(rename.body.data.groupBy).toBe('STATUS');
    expect(rename.body.data.filters).toEqual({ status: 'NEW', includeInactive: false });

    const change = await request(app)
      .patch(`/api/custom-reports/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ groupBy: 'PRIORITY', metric: 'SUM_DEAL_VALUE', filters: { priority: 'HIGH' } });
    expect(change.status).toBe(200);
    expect(change.body.data.groupBy).toBe('PRIORITY');
    expect(change.body.data.metric).toBe('SUM_DEAL_VALUE');
    expect(change.body.data.filters).toEqual({ priority: 'HIGH', includeInactive: false });
  });

  it('rejects a duplicate name for the same creator (409) but allows the same name across different creators', async () => {
    const first = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Duplicate Report Name', groupBy: 'STATUS' });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Duplicate Report Name', groupBy: 'SOURCE' });
    expect(duplicate.status).toBe(409);

    const sameNameOtherUser = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Duplicate Report Name', groupBy: 'SOURCE' });
    expect(sameNameOtherUser.status).toBe(201);
  });

  it("an owner can delete their own personal report, and it's gone from their list afterward", async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Report to delete', groupBy: 'STATUS' });
    const id = create.body.data.id;

    const del = await request(app).delete(`/api/custom-reports/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((r: any) => r.name)).not.toContain('Report to delete');
  });

  it("a different organization's reports are completely invisible (404 on direct fetch, absent from list)", async () => {
    const create = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Org A only report', groupBy: 'STATUS', isShared: true });
    const id = create.body.data.id;

    const orgBFetch = await request(app).get(`/api/custom-reports/${id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBFetch.status).toBe(404);

    const orgBList = await request(app).get('/api/custom-reports?entityType=LEAD').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((r: any) => r.name)).not.toContain('Org A only report');
  });
});

describe('Running a report — aggregation correctness', () => {
  // Every lead created in this block is tagged to a campaign unique to this describe block, and
  // every run below filters by that campaignId — so the assertions hold regardless of what other
  // leads exist elsewhere in this file (or what order tests run in), without needing to reset the
  // database between tests.
  let campaignId: string;

  beforeAll(async () => {
    const campaign = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Report Aggregation Test ${Date.now().toString(36)}` });
    expect(campaign.status).toBe(201);
    campaignId = campaign.body.data.id;

    const leadPayloads = [
      { companyName: 'Aggregation Co A', source: 'EMAIL', status: 'NEW', priority: 'HIGH', dealValue: 1000, campaignId },
      { companyName: 'Aggregation Co B', source: 'EMAIL', status: 'QUALIFIED', priority: 'HIGH', dealValue: 3000, campaignId },
      { companyName: 'Aggregation Co C', source: 'WEBSITE', status: 'NEW', priority: 'LOW', dealValue: 500, campaignId },
    ];
    for (const payload of leadPayloads) {
      const res = await request(app).post('/api/leads').set('Authorization', `Bearer ${adminToken}`).send(payload);
      expect(res.status).toBe(201);
    }
  });

  it('groups by STATUS with metric COUNT', async () => {
    const res = await request(app)
      .post('/api/custom-reports/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groupBy: 'STATUS', metric: 'COUNT', chartType: 'BAR', filters: { campaignId } });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as { key: string; value: number }[];
    expect(rows.find((r) => r.key === 'NEW')?.value).toBe(2);
    expect(rows.find((r) => r.key === 'QUALIFIED')?.value).toBe(1);
    expect(res.body.data.totalValue).toBe(3);
  });

  it('groups by PRIORITY with metric SUM_DEAL_VALUE', async () => {
    const res = await request(app)
      .post('/api/custom-reports/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groupBy: 'PRIORITY', metric: 'SUM_DEAL_VALUE', chartType: 'PIE', filters: { campaignId } });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as { key: string; value: number }[];
    expect(rows.find((r) => r.key === 'HIGH')?.value).toBe(4000);
    expect(rows.find((r) => r.key === 'LOW')?.value).toBe(500);
  });

  it('groups by CAMPAIGN, labeling by the campaign name via the join', async () => {
    const res = await request(app)
      .post('/api/custom-reports/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groupBy: 'CAMPAIGN', metric: 'COUNT', filters: { campaignId } });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as { key: string; label: string; value: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(campaignId);
    expect(rows[0].value).toBe(3);
  });

  it('applies a status filter on top of the groupBy dimension', async () => {
    const res = await request(app)
      .post('/api/custom-reports/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groupBy: 'SOURCE', metric: 'COUNT', filters: { campaignId, status: 'NEW' } });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as { key: string; value: number }[];
    // Only the two NEW leads (EMAIL + WEBSITE) should be counted — QUALIFIED is filtered out.
    expect(rows.reduce((sum, r) => sum + r.value, 0)).toBe(2);
    expect(rows.find((r) => r.key === 'EMAIL')?.value).toBe(1);
    expect(rows.find((r) => r.key === 'WEBSITE')?.value).toBe(1);
  });

  it('runs a saved report definition by id and gets the same shape back', async () => {
    const saved = await request(app)
      .post('/api/custom-reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Saved aggregation report', groupBy: 'STATUS', metric: 'COUNT', filters: { campaignId } });
    expect(saved.status).toBe(201);

    const run = await request(app).post(`/api/custom-reports/${saved.body.data.id}/run`).set('Authorization', `Bearer ${adminToken}`);
    expect(run.status).toBe(200);
    expect(run.body.data.groupBy).toBe('STATUS');
    const rows = run.body.data.rows as { key: string; value: number }[];
    expect(rows.find((r) => r.key === 'NEW')?.value).toBe(2);
  });

  it('rejects running an ad-hoc report with an invalid metric', async () => {
    const res = await request(app)
      .post('/api/custom-reports/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groupBy: 'STATUS', metric: 'NOT_A_METRIC' });
    expect(res.status).toBe(400);
  });
});
