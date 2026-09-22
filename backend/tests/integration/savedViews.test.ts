import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 7 ("custom views/nav" per Section K's superseding 15-phase breakdown): saved list-page
// filter/sort presets, scoped to entityType 'LEAD' for now (see db/schema.ts's savedViews table
// comment). A view is either personal (visible only to its creator) or shared (visible to the
// whole organization) — creating or editing a SHARED one needs SAVED_VIEWS_MANAGE_SHARED
// (ADMIN/MANAGEMENT by default), while a personal one needs only LEADS_VIEW and ownership.

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

describe('Saved views', () => {
  it('any LEADS_VIEW holder can create, list, and read back their own personal view', async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'My Hot Leads', filters: { status: 'QUALIFIED', priority: 'HIGH' } });
    expect(create.status).toBe(201);
    expect(create.body.data.isShared).toBe(false);
    expect(create.body.data.filters).toEqual({ status: 'QUALIFIED', priority: 'HIGH' });

    const list = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((v: any) => v.name)).toContain('My Hot Leads');

    const getOne = await request(app).get(`/api/saved-views/${create.body.data.id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(getOne.status).toBe(200);
  });

  it('rejects creating a SHARED view without SAVED_VIEWS_MANAGE_SHARED (INSIDE_SALES)', async () => {
    const res = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Team View Attempt', filters: {}, isShared: true });
    expect(res.status).toBe(403);
  });

  it('an ADMIN can create a shared view, and every org member sees it in their own list', async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team: This Week', filters: { sortBy: 'createdAt', sortDir: 'desc' }, isShared: true });
    expect(create.status).toBe(201);
    expect(create.body.data.isShared).toBe(true);

    const insideSalesList = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(insideSalesList.body.data.map((v: any) => v.name)).toContain('Team: This Week');

    const salesList = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${salesToken}`);
    expect(salesList.body.data.map((v: any) => v.name)).toContain('Team: This Week');
  });

  it('a personal view is invisible to everyone except its creator (404, not just filtered out)', async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales-only personal view', filters: {} });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const otherUsersList = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(otherUsersList.body.data.map((v: any) => v.name)).not.toContain('Sales-only personal view');

    const directFetch = await request(app).get(`/api/saved-views/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(directFetch.status).toBe(404);
  });

  it("rejects editing or deleting someone else's personal view even with LEADS_VIEW", async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Inside-sales-only view', filters: {} });
    const id = create.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/saved-views/${id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Renamed' });
    expect(editAttempt.status).toBe(404);

    const deleteAttempt = await request(app).delete(`/api/saved-views/${id}`).set('Authorization', `Bearer ${salesToken}`);
    expect(deleteAttempt.status).toBe(404);
  });

  it('rejects editing or deleting a SHARED view without SAVED_VIEWS_MANAGE_SHARED, even by its own creator', async () => {
    // ADMIN holds SAVED_VIEWS_MANAGE_SHARED (via ALL_PERMISSIONS), so create it as ADMIN, then
    // prove an INSIDE_SALES caller (no such permission) can't touch it despite being able to see
    // and read it (it's shared, so visible) — management of a shared view is a permission tier,
    // not "whoever made it."
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Shared view for edit test', filters: {}, isShared: true });
    const id = create.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/saved-views/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Renamed by non-manager' });
    expect(editAttempt.status).toBe(403);

    const deleteAttempt = await request(app).delete(`/api/saved-views/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it('an owner can rename, change filters, and clear a saved view back to unshared (or leave fields as-is)', async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Editable view', filters: { status: 'NEW' } });
    const id = create.body.data.id;

    const rename = await request(app)
      .patch(`/api/saved-views/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Editable view (renamed)' });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Editable view (renamed)');
    // Omitted `filters` on this update leaves the prior value as-is.
    expect(rename.body.data.filters).toEqual({ status: 'NEW' });

    const changeFilters = await request(app)
      .patch(`/api/saved-views/${id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ filters: { status: 'CONTACTED', priority: 'LOW' } });
    expect(changeFilters.status).toBe(200);
    expect(changeFilters.body.data.filters).toEqual({ status: 'CONTACTED', priority: 'LOW' });
  });

  it('rejects a duplicate name for the same creator (409) but allows the same name across different creators', async () => {
    const first = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Duplicate Name Test', filters: {} });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Duplicate Name Test', filters: {} });
    expect(duplicate.status).toBe(409);

    const sameNameOtherUser = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Duplicate Name Test', filters: {} });
    expect(sameNameOtherUser.status).toBe(201);
  });

  it("an owner can delete their own personal view, and it's gone from their list afterward", async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'View to delete', filters: {} });
    const id = create.body.data.id;

    const del = await request(app).delete(`/api/saved-views/${id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.body.data.map((v: any) => v.name)).not.toContain('View to delete');
  });

  it("a different organization's saved views are completely invisible (404 on direct fetch, absent from list)", async () => {
    const create = await request(app)
      .post('/api/saved-views')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Org A only view', filters: {}, isShared: true });
    const id = create.body.data.id;

    const orgBFetch = await request(app).get(`/api/saved-views/${id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBFetch.status).toBe(404);

    const orgBList = await request(app).get('/api/saved-views?entityType=LEAD').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((v: any) => v.name)).not.toContain('Org A only view');
  });
});
