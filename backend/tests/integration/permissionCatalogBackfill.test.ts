import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { permissions, rolePermissions, roles } from '@/db/schema';
import { PERMISSIONS } from '@/utils/permissions';
import { backfillPermissionCatalogAndDefaultRoleGrants } from '@/utils/permissionCatalogBackfill';
import { primaryOrgId, secondaryOrgId, primaryRoleIds, secondaryRoleIds } from '../setup';

// Regression coverage for a real production gap: `db/seed.ts` (which inserts new permission keys
// into the global catalog and grants them to each org's default roles) only runs on boot when
// RUN_SEED_ON_BOOT=true — which this project's production environment does not set. So every
// phase that added a brand-new PERMISSIONS key (Phase 4's CUSTOM_FIELDS_MANAGE, Phase 5's
// CUSTOM_OBJECTS_MANAGE, ...) shipped it in code but never reached the already-running production
// database's catalog or its existing organizations' role grants — an existing org's Admin saw no
// UI gated by any post-launch permission. `backfillPermissionCatalogAndDefaultRoleGrants` (called
// from db/migrate.ts on every boot, unconditionally) is the durable fix; these tests simulate the
// exact "stale" state it must repair by deliberately deleting a catalog row and its grants first.

async function deleteCatalogRowAndGrants(key: string) {
  const row = await db.query.permissions.findFirst({ where: eq(permissions.key, key) });
  if (!row) return;
  await db.delete(rolePermissions).where(eq(rolePermissions.permissionId, row.id));
  await db.delete(permissions).where(eq(permissions.id, row.id));
}

describe('Permission catalog backfill', () => {
  it("repairs a missing catalog row and re-grants it to every organization's ADMIN role", async () => {
    await deleteCatalogRowAndGrants(PERMISSIONS.CUSTOM_OBJECTS_MANAGE);

    const missingRow = await db.query.permissions.findFirst({ where: eq(permissions.key, PERMISSIONS.CUSTOM_OBJECTS_MANAGE) });
    expect(missingRow).toBeUndefined();

    await backfillPermissionCatalogAndDefaultRoleGrants();

    const restoredRow = await db.query.permissions.findFirst({ where: eq(permissions.key, PERMISSIONS.CUSTOM_OBJECTS_MANAGE) });
    expect(restoredRow).toBeDefined();

    for (const roleId of [primaryRoleIds.ADMIN, secondaryRoleIds.ADMIN]) {
      const grant = await db.query.rolePermissions.findFirst({
        where: and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, restoredRow!.id)),
      });
      expect(grant).toBeDefined();
    }
  });

  it("never grants a permission to a tenant's own custom role (only DEFAULT_ROLE_NAMES roles)", async () => {
    const [customRole] = await db
      .insert(roles)
      .values({ organizationId: primaryOrgId, name: 'Custom Auditor Role', description: 'A tenant-created role, not a default one' })
      .returning();

    await backfillPermissionCatalogAndDefaultRoleGrants();

    const anyGrant = await db.query.rolePermissions.findFirst({ where: eq(rolePermissions.roleId, customRole.id) });
    expect(anyGrant).toBeUndefined();

    await db.delete(roles).where(eq(roles.id, customRole.id));
  });

  it('is idempotent — running it twice in a row does not throw or duplicate grants', async () => {
    await deleteCatalogRowAndGrants(PERMISSIONS.PIPELINE_STAGES_MANAGE);

    await backfillPermissionCatalogAndDefaultRoleGrants();
    await expect(backfillPermissionCatalogAndDefaultRoleGrants()).resolves.not.toThrow();

    const row = await db.query.permissions.findFirst({ where: eq(permissions.key, PERMISSIONS.PIPELINE_STAGES_MANAGE) });
    const grants = await db.query.rolePermissions.findMany({
      where: and(eq(rolePermissions.roleId, primaryRoleIds.ADMIN), eq(rolePermissions.permissionId, row!.id)),
    });
    expect(grants).toHaveLength(1);
  });
});
