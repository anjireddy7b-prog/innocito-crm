import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { organizations } from '@/db/schema';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_PLATFORM_ADMIN, TEST_ORG_B_ADMIN, primaryOrgId, secondaryOrgId } from '../setup';

// Phase 13 (super admin), slice 1 — organization management console. Covers: only isPlatformAdmin
// (never an ordinary ADMIN, however permissioned) can reach these routes; the console genuinely
// sees every organization, not just the caller's own; and suspending an organization actually
// blocks its members from logging in (not just a cosmetic flag) while never blocking a platform
// admin's OWN login even if their home org were ever marked inactive.
const app = createApp();

let platformAdminToken: string;
let adminToken: string;

beforeAll(async () => {
  const platformAdmin = await request(app).post('/api/auth/login').send(TEST_PLATFORM_ADMIN);
  platformAdminToken = platformAdmin.body.data.accessToken;
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('Platform admin access control', () => {
  it('an ordinary organization Admin — even with every permission ADMIN holds — cannot reach the platform admin console', async () => {
    const res = await request(app).get('/api/platform-admin/organizations').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('a platform admin can list organizations', async () => {
    const res = await request(app).get('/api/platform-admin/organizations').set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/platform-admin/organizations', () => {
  it('lists organizations across every tenant, not just one', async () => {
    const res = await request(app)
      .get('/api/platform-admin/organizations')
      .query({ pageSize: 100 })
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((o: any) => o.id);
    expect(ids).toContain(primaryOrgId);
    expect(ids).toContain(secondaryOrgId);
  });

  it('search filters by organization name', async () => {
    const res = await request(app)
      .get('/api/platform-admin/organizations')
      .query({ search: 'Other Tenant' })
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((o: any) => o.id === secondaryOrgId)).toBe(true);
  });

  it('each row reports its usage and plan', async () => {
    const res = await request(app)
      .get('/api/platform-admin/organizations')
      .query({ search: 'Test Org' })
      .set('Authorization', `Bearer ${platformAdminToken}`);
    const row = res.body.data.find((o: any) => o.id === primaryOrgId);
    expect(row).toBeTruthy();
    expect(row.userCount).toBeGreaterThanOrEqual(3);
    expect(row.plan.id).toBe('FREE');
  });
});

describe('GET /api/platform-admin/organizations/:id', () => {
  it('returns the organization detail including its member list', async () => {
    const res = await request(app)
      .get(`/api/platform-admin/organizations/${primaryOrgId}`)
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(primaryOrgId);
    expect(res.body.data.users.some((u: any) => u.email === TEST_ADMIN.email)).toBe(true);
  });

  it('404s for an organization that does not exist', async () => {
    const res = await request(app)
      .get('/api/platform-admin/organizations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/platform-admin/organizations/:id/active — suspend/reactivate', () => {
  it('suspending an organization blocks its members from logging in, with a clear message', async () => {
    const suspend = await request(app)
      .patch(`/api/platform-admin/organizations/${secondaryOrgId}/active`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ isActive: false });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.isActive).toBe(false);

    const loginAttempt = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.body.message).toMatch(/suspended/i);

    // Reactivate so no other test file (or a re-run of this one against the same DB) is affected.
    const reactivate = await request(app)
      .patch(`/api/platform-admin/organizations/${secondaryOrgId}/active`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ isActive: true });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.isActive).toBe(true);

    const loginAfterReactivate = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
    expect(loginAfterReactivate.status).toBe(200);
  });

  it('a platform admin can still log in even if their own organization were suspended', async () => {
    const [internalOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'internal-ops'));
    await db.update(organizations).set({ isActive: false }).where(eq(organizations.id, internalOrg.id));

    const loginAttempt = await request(app).post('/api/auth/login').send(TEST_PLATFORM_ADMIN);
    expect(loginAttempt.status).toBe(200);

    // Restore, so this doesn't leak into any other test in this file or another.
    await db.update(organizations).set({ isActive: true }).where(eq(organizations.id, internalOrg.id));
  });

  it('an ordinary organization Admin cannot suspend organizations', async () => {
    const res = await request(app)
      .patch(`/api/platform-admin/organizations/${secondaryOrgId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });
});
