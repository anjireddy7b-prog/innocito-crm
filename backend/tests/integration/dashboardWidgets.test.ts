import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES } from '../setup';

const app = createApp();

// Phase 10 (reporting/dashboard builder), slice 2 — pinning saved custom reports onto a personal
// dashboard. Every route here is scoped to the caller's own userId (see
// dashboardWidgets.service.ts), so the coverage below is about per-user isolation and the
// visibility check reused from reportBuilder.service.ts, rather than an org-wide sharing model
// (there isn't one for widgets — see db/schema.ts's dashboardWidgets table comment).

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

async function createReport(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/custom-reports')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Widget test report ${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, groupBy: 'STATUS', ...overrides });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; name: string };
}

describe('Dashboard widgets — pin, list, unpin', () => {
  it('pinning a visible report succeeds and it shows up in the list, joined with its report definition', async () => {
    const report = await createReport(insideSalesToken);

    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    expect(pin.status).toBe(201);
    expect(pin.body.data.reportDefinitionId).toBe(report.id);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.status).toBe(200);
    const widget = list.body.data.find((w: any) => w.reportDefinitionId === report.id);
    expect(widget).toBeTruthy();
    expect(widget.reportDefinition.name).toBe(report.name);
  });

  it('a caller can pin a SHARED report created by someone else', async () => {
    const report = await createReport(adminToken, { isShared: true, groupBy: 'SOURCE' });

    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    expect(pin.status).toBe(201);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((w: any) => w.reportDefinitionId)).toContain(report.id);
  });

  it('pinning a report the caller cannot see (another user\'s personal report) is rejected with 404', async () => {
    const report = await createReport(salesToken);

    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    expect(pin.status).toBe(404);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((w: any) => w.reportDefinitionId)).not.toContain(report.id);
  });

  it('pinning a nonexistent reportDefinitionId is rejected with 404', async () => {
    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: '00000000-0000-0000-0000-000000000000' });
    expect(pin.status).toBe(404);
  });

  it('pinning an already-pinned report is idempotent — no duplicate widget, no error', async () => {
    const report = await createReport(insideSalesToken);

    const firstPin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    expect(firstPin.status).toBe(201);

    const secondPin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    expect(secondPin.status).toBe(201);
    expect(secondPin.body.data.id).toBe(firstPin.body.data.id);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.filter((w: any) => w.reportDefinitionId === report.id)).toHaveLength(1);
  });

  it('an owner can unpin their own widget, and it disappears from their list', async () => {
    const report = await createReport(insideSalesToken);
    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    const widgetId = pin.body.data.id;

    const unpin = await request(app).delete(`/api/dashboard-widgets/${widgetId}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(unpin.status).toBe(204);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((w: any) => w.id)).not.toContain(widgetId);
  });

  it("rejects unpinning someone else's widget (404, not a cross-user delete)", async () => {
    const report = await createReport(insideSalesToken);
    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    const widgetId = pin.body.data.id;

    const crossUserUnpin = await request(app).delete(`/api/dashboard-widgets/${widgetId}`).set('Authorization', `Bearer ${salesToken}`);
    expect(crossUserUnpin.status).toBe(404);

    // Still there, untouched, from the actual owner's point of view.
    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((w: any) => w.id)).toContain(widgetId);
  });

  it('unpinning a nonexistent widget id is rejected with 404', async () => {
    const res = await request(app)
      .delete('/api/dashboard-widgets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(404);
  });

  it("two different users' pinned widgets never appear in each other's list, even within the same org", async () => {
    const insideSalesReport = await createReport(insideSalesToken, { name: `Isolation A ${Date.now()}` });
    const salesReport = await createReport(salesToken, { name: `Isolation B ${Date.now()}` });

    await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: insideSalesReport.id });
    await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ reportDefinitionId: salesReport.id });

    const insideSalesList = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(insideSalesList.body.data.map((w: any) => w.reportDefinitionId)).toContain(insideSalesReport.id);
    expect(insideSalesList.body.data.map((w: any) => w.reportDefinitionId)).not.toContain(salesReport.id);

    const salesList = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`);
    expect(salesList.body.data.map((w: any) => w.reportDefinitionId)).toContain(salesReport.id);
    expect(salesList.body.data.map((w: any) => w.reportDefinitionId)).not.toContain(insideSalesReport.id);
  });

  it('deleting the underlying report definition cascades — the pinned widget disappears automatically', async () => {
    const report = await createReport(insideSalesToken, { name: `Cascade source ${Date.now()}` });
    const pin = await request(app)
      .post('/api/dashboard-widgets')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ reportDefinitionId: report.id });
    const widgetId = pin.body.data.id;

    const del = await request(app).delete(`/api/custom-reports/${report.id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((w: any) => w.id)).not.toContain(widgetId);
  });
});

describe('Dashboard widgets — reordering', () => {
  it('reorders the caller\'s widgets to match the submitted id order', async () => {
    const reportA = await createReport(salesToken, { name: `Reorder A ${Date.now()}` });
    const reportB = await createReport(salesToken, { name: `Reorder B ${Date.now()}` });
    const reportC = await createReport(salesToken, { name: `Reorder C ${Date.now()}` });

    const pinA = await request(app).post('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`).send({ reportDefinitionId: reportA.id });
    const pinB = await request(app).post('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`).send({ reportDefinitionId: reportB.id });
    const pinC = await request(app).post('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`).send({ reportDefinitionId: reportC.id });

    // Grab the caller's FULL current widget set (there may be leftovers from earlier tests in this
    // file, since the DB is only truncated once per test file — see tests/setup.ts), then reorder
    // it so these three land, reversed, at the front.
    const before = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`);
    const otherIds = before.body.data.map((w: any) => w.id).filter((id: string) => ![pinA.body.data.id, pinB.body.data.id, pinC.body.data.id].includes(id));
    const orderedIds = [pinC.body.data.id, pinB.body.data.id, pinA.body.data.id, ...otherIds];

    const reorder = await request(app)
      .patch('/api/dashboard-widgets/reorder')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ orderedIds });
    expect(reorder.status).toBe(200);
    expect(reorder.body.data.map((w: any) => w.id).slice(0, 3)).toEqual([pinC.body.data.id, pinB.body.data.id, pinA.body.data.id]);

    const after = await request(app).get('/api/dashboard-widgets').set('Authorization', `Bearer ${salesToken}`);
    expect(after.body.data.map((w: any) => w.id).slice(0, 3)).toEqual([pinC.body.data.id, pinB.body.data.id, pinA.body.data.id]);
  });

  it('rejects a reorder whose id set does not exactly match the caller\'s current widgets (400)', async () => {
    const report = await createReport(insideSalesToken, { name: `Reorder mismatch ${Date.now()}` });
    const pin = await request(app).post('/api/dashboard-widgets').set('Authorization', `Bearer ${insideSalesToken}`).send({ reportDefinitionId: report.id });

    // Missing an id the caller actually has (only ever including one, when there's at least this
    // one plus possibly others from earlier tests) is a mismatch — too few.
    const tooFew = await request(app)
      .patch('/api/dashboard-widgets/reorder')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ orderedIds: [] });
    expect(tooFew.status).toBe(400);

    // An id the caller doesn't own at all is also a mismatch — too many / wrong.
    const foreignId = '00000000-0000-0000-0000-000000000000';
    const wrongId = await request(app)
      .patch('/api/dashboard-widgets/reorder')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ orderedIds: [pin.body.data.id, foreignId] });
    expect(wrongId.status).toBe(400);
  });

  it('rejects a reorder payload with an empty orderedIds array at the validation layer (400)', async () => {
    const res = await request(app)
      .patch('/api/dashboard-widgets/reorder')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ orderedIds: [] });
    expect(res.status).toBe(400);
  });
});
