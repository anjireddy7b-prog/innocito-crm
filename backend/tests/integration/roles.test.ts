import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN, primaryRoleIds } from '../setup';

const app = createApp();

// Phase 3: `roles` moved from a single global catalog to tenant-scoped, admin-editable data (see
// migrations 0011-0013 and the Architecture Report). These tests prove the three things that
// migration was for: every organization sees only its own roles, the fixed default roles seeded
// on migration day are still there with their original grants intact, and the new CRUD endpoints
// enforce both permission gates and tenant isolation the same way every other module does.

let adminToken: string;
let insideSalesToken: string;
let orgBToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const orgB = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBToken = orgB.body.data.accessToken;
});

describe('GET /api/roles', () => {
  it('an Admin sees exactly this organization\'s 5 default roles, with their permission grants', async () => {
    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((r: any) => r.name).sort();
    expect(names).toEqual(['ADMIN', 'DELIVERY', 'INSIDE_SALES', 'MANAGEMENT', 'SALES']);

    const admin = res.body.data.find((r: any) => r.name === 'ADMIN');
    expect(admin.permissions).toContain('users:manage');
    expect(admin.permissions).toContain('roles:manage');

    const insideSales = res.body.data.find((r: any) => r.name === 'INSIDE_SALES');
    expect(insideSales.permissions).toContain('leads:create');
    expect(insideSales.permissions).not.toContain('audit_logs:view');
  });

  it('a caller without ROLES_VIEW or USERS_MANAGE cannot list roles', async () => {
    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(403);
  });

  it('org B never sees org A\'s roles, even though both orgs have a role literally named "ADMIN"', async () => {
    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    const adminRoleIds = res.body.data.map((r: any) => r.id);
    expect(adminRoleIds).not.toContain(primaryRoleIds.ADMIN);
  });

  it('regression: editing org B\'s "ADMIN" role never touches org A\'s "ADMIN" role — the exact bug migrations 0011-0013 fixed', async () => {
    const orgBRoles = await request(app).get('/api/roles').set('Authorization', `Bearer ${orgBToken}`);
    const orgBAdmin = orgBRoles.body.data.find((r: any) => r.name === 'ADMIN');
    expect(orgBAdmin.id).not.toBe(primaryRoleIds.ADMIN); // distinct rows, not the pre-Phase-3 shared one

    const before = await request(app).get('/api/roles').set('Authorization', `Bearer ${adminToken}`);
    const orgAAdminBefore = before.body.data.find((r: any) => r.name === 'ADMIN');

    // Strip org B's ADMIN role down to a single permission — if the two orgs still shared a row
    // (the pre-migration bug), this would also strip org A's ADMIN grants.
    const stripped = await request(app)
      .patch(`/api/roles/${orgBAdmin.id}`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ permissionKeys: ['dashboard:view'] });
    expect(stripped.status).toBe(200);
    expect(stripped.body.data.permissions).toEqual(['dashboard:view']);

    const after = await request(app).get('/api/roles').set('Authorization', `Bearer ${adminToken}`);
    const orgAAdminAfter = after.body.data.find((r: any) => r.name === 'ADMIN');
    expect(orgAAdminAfter.permissions.sort()).toEqual(orgAAdminBefore.permissions.sort());
    expect(orgAAdminAfter.permissions).toContain('users:manage');

    // Restore org B's ADMIN role so it doesn't leave org B without an admin for any later test.
    await request(app)
      .patch(`/api/roles/${orgBAdmin.id}`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ permissionKeys: orgBAdmin.permissions });
  });
});

describe('GET /api/permissions', () => {
  it('returns the fixed permission catalog with descriptions', async () => {
    const res = await request(app).get('/api/permissions').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(20);
    const usersManage = res.body.data.find((p: any) => p.key === 'users:manage');
    expect(usersManage.description).toBeTruthy();
  });
});

describe('Role CRUD', () => {
  let customRoleId: string;

  it('a non-Admin cannot create a role (missing ROLES_MANAGE)', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Should Not Exist', permissionKeys: ['leads:view'] });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown permission key', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Role', permissionKeys: ['not:a_real_permission'] });
    expect(res.status).toBe(400);
  });

  it('an Admin can create a custom role with a specific permission set', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team Lead', description: 'Leads a pod of reps', permissionKeys: ['leads:view', 'leads:assign', 'reports:view'] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Team Lead');
    expect(res.body.data.permissions.sort()).toEqual(['leads:assign', 'leads:view', 'reports:view']);
    customRoleId = res.body.data.id;
  });

  it('rejects a second role with the same name in the same organization', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team Lead', permissionKeys: [] });
    expect(res.status).toBe(409);
  });

  it('an Admin can rename a role and change its grants', async () => {
    const res = await request(app)
      .patch(`/api/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Senior Team Lead', permissionKeys: ['leads:view', 'leads:edit_any'] });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Senior Team Lead');
    expect(res.body.data.permissions.sort()).toEqual(['leads:edit_any', 'leads:view']);
  });

  it('a role in another organization is invisible (404, not a cross-tenant leak)', async () => {
    const res = await request(app).get(`/api/roles/${customRoleId}`).set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it('deletion is blocked while a user still holds the role', async () => {
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `role.holder.${Date.now()}@innocito.com`, firstName: 'Role', lastName: 'Holder', roleId: customRoleId });
    expect(created.status).toBe(201);

    const del = await request(app).delete(`/api/roles/${customRoleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(409);

    // Move the user off the role, then deletion succeeds.
    await request(app)
      .patch(`/api/users/${created.body.data.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: primaryRoleIds.SALES });

    const del2 = await request(app).delete(`/api/roles/${customRoleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del2.status).toBe(204);
  });

  it('a caller cannot assign a user to another organization\'s role id', async () => {
    // Reach into org B's role set by id (org A's admin token) — must be rejected as unknown,
    // not silently accepted, or a user could be pointed at another tenant's role definition.
    const orgBRoles = await request(app).get('/api/roles').set('Authorization', `Bearer ${orgBToken}`);
    const orgBRoleId = orgBRoles.body.data[0].id;

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `cross.tenant.${Date.now()}@innocito.com`, firstName: 'Cross', lastName: 'Tenant', roleId: orgBRoleId });
    expect(res.status).toBe(400);
  });
});
