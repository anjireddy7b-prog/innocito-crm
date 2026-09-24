import { beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/config/db';
import { organizations, permissions, users, campaigns } from '@/db/schema';
import { ALL_PERMISSIONS } from '@/utils/permissions';
import { seedDefaultRolesForOrganization } from '@/utils/defaultRoles';
import { seedDefaultPipelineStagesForOrganization } from '@/utils/defaultPipelineStages';
import { NEW_CAMPAIGN_SEEDS } from '@/utils/leadFormOptions';

export const TEST_ADMIN = { email: 'admin@innocito.com', password: 'ChangeMe!123' };
export const TEST_INSIDE_SALES = { email: 'inside.sales@innocito.com', password: 'Welcome@123' };
export const TEST_SALES = { email: 'sales@innocito.com', password: 'Welcome@123' };

// A second, wholly separate tenant — exported so tenant-isolation tests (see
// tenantIsolation.test.ts) can prove org A's data is invisible to it, and vice versa, without
// depending on seedMinimal()'s internals.
export const TEST_ORG_B_ADMIN = { email: 'admin@othertenant.com', password: 'ChangeMe!123' };

// Phase 13 (super admin) — a platform admin is still an ordinary user row (see db/schema.ts's
// users.isPlatformAdmin comment), but deliberately lives in its OWN third organization here
// rather than being added to primaryOrgId's user set: several existing tests (and billing.test.ts
// from Phase 12) assert exact user counts for primaryOrgId, and a platform admin isn't a real
// member of that tenant's team anyway.
export const TEST_PLATFORM_ADMIN = { email: 'ops@innocito-platform.internal', password: 'ChangeMe!123' };

export let primaryOrgId: string;
export let secondaryOrgId: string;
export let internalOrgId: string;

// Phase 3: role name -> roleId, one independent map per organization (see
// utils/defaultRoles.ts). Exported so tests that need to assign/reassign a role (e.g.
// users.test.ts's roleId-based create/update payloads) don't have to re-derive these themselves —
// and, just as importantly, so no test can accidentally reach for a role id that actually belongs
// to the OTHER organization, which is exactly the bug this phase's migration fixed in production.
export let primaryRoleIds: Record<string, string>;
export let secondaryRoleIds: Record<string, string>;

// Phase 4: key -> pipeline stage id, one independent set per organization (see
// utils/defaultPipelineStages.ts) — same "own copy per org" discipline as roles above.
export let primaryPipelineStageIds: Record<string, string>;
export let secondaryPipelineStageIds: Record<string, string>;

async function seedMinimal() {
  const [primaryOrg] = await db.insert(organizations).values({ name: 'Test Org', slug: 'test-org' }).returning();
  primaryOrgId = primaryOrg.id;
  const [secondaryOrg] = await db.insert(organizations).values({ name: 'Other Tenant', slug: 'other-tenant' }).returning();
  secondaryOrgId = secondaryOrg.id;
  const [internalOrg] = await db.insert(organizations).values({ name: 'Internal Ops', slug: 'internal-ops' }).returning();
  internalOrgId = internalOrg.id;

  await Promise.all(ALL_PERMISSIONS.map((key) => db.insert(permissions).values({ key })));

  // Each organization gets its OWN copy of the 5 default roles via the same helper production
  // code uses (db/seed.ts, organizations.service.ts's signup()) — never a role row shared between
  // the two test tenants, mirroring exactly what migrations 0011-0013 fixed for real data.
  const primaryRoles = await seedDefaultRolesForOrganization(primaryOrgId);
  const secondaryRoles = await seedDefaultRolesForOrganization(secondaryOrgId);
  const internalRoles = await seedDefaultRolesForOrganization(internalOrgId);
  primaryRoleIds = Object.fromEntries([...primaryRoles.entries()].map(([name, role]) => [name, role.id]));
  secondaryRoleIds = Object.fromEntries([...secondaryRoles.entries()].map(([name, role]) => [name, role.id]));
  const internalRoleIds = Object.fromEntries([...internalRoles.entries()].map(([name, role]) => [name, role.id]));

  const primaryStages = await seedDefaultPipelineStagesForOrganization(primaryOrgId);
  const secondaryStages = await seedDefaultPipelineStagesForOrganization(secondaryOrgId);
  primaryPipelineStageIds = Object.fromEntries(primaryStages.map((s) => [s.key, s.id]));
  secondaryPipelineStageIds = Object.fromEntries(secondaryStages.map((s) => [s.key, s.id]));

  await db.insert(users).values({
    organizationId: primaryOrgId,
    email: TEST_ADMIN.email,
    firstName: 'Test',
    lastName: 'Admin',
    roleId: primaryRoleIds.ADMIN,
    passwordHash: await argon2.hash(TEST_ADMIN.password),
    mustChangePassword: false,
    isActive: true,
  });

  await db.insert(users).values({
    organizationId: primaryOrgId,
    email: TEST_INSIDE_SALES.email,
    firstName: 'Test',
    lastName: 'InsideSales',
    roleId: primaryRoleIds.INSIDE_SALES,
    passwordHash: await argon2.hash(TEST_INSIDE_SALES.password),
    mustChangePassword: false,
    isActive: true,
  });

  await db.insert(users).values({
    organizationId: primaryOrgId,
    email: TEST_SALES.email,
    firstName: 'Test',
    lastName: 'Sales',
    roleId: primaryRoleIds.SALES,
    passwordHash: await argon2.hash(TEST_SALES.password),
    mustChangePassword: false,
    isActive: true,
  });

  // A lone Admin in a second organization — every tenant-isolation test authenticates as this
  // user to prove they can't see/touch anything created under primaryOrgId.
  await db.insert(users).values({
    organizationId: secondaryOrgId,
    email: TEST_ORG_B_ADMIN.email,
    firstName: 'Other',
    lastName: 'Admin',
    roleId: secondaryRoleIds.ADMIN,
    passwordHash: await argon2.hash(TEST_ORG_B_ADMIN.password),
    mustChangePassword: false,
    isActive: true,
  });

  // Phase 13 (super admin) — the one seeded user with isPlatformAdmin: true, used by
  // platformAdmin.test.ts. Lives in its own org (see internalOrgId above), same as
  // TEST_ORG_B_ADMIN lives in secondaryOrgId.
  await db.insert(users).values({
    organizationId: internalOrgId,
    email: TEST_PLATFORM_ADMIN.email,
    firstName: 'Platform',
    lastName: 'Admin',
    roleId: internalRoleIds.ADMIN,
    passwordHash: await argon2.hash(TEST_PLATFORM_ADMIN.password),
    mustChangePassword: false,
    isActive: true,
    isPlatformAdmin: true,
  });

  // Mirrors migration 0003_seed_new_campaigns.sql — the TRUNCATE below wipes out whatever the
  // migration inserted, so the fixtures re-seed the same rows for tests that rely on them.
  await db.insert(campaigns).values(NEW_CAMPAIGN_SEEDS.map((c) => ({ ...c, organizationId: primaryOrgId, status: 'ACTIVE' as const })));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  // Clean slate in case a previous run left data behind (test DB is dedicated, safe to truncate)
  const tableNames = [
    'audit_logs', 'notifications', 'activities', 'comments', 'documents', 'tasks', 'meetings',
    'leads', 'campaigns', 'contacts', 'companies', 'refresh_tokens', 'users', 'role_permissions',
    'permissions', 'roles', 'custom_field_definitions', 'pipeline_stages', 'organizations',
  ];
  await pool.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
  await seedMinimal();
}, 30000);

afterAll(async () => {
  await pool.end();
});
