/**
 * Phase 3 (see migrations 0011-0013 and the Architecture Report): creates one organization's own
 * independent copies of the fixed catalog of default roles — DEFAULT_ROLE_NAMES /
 * DEFAULT_ROLE_DESCRIPTIONS / ROLE_PERMISSIONS in utils/permissions.ts — with today's exact
 * grants for each.
 *
 * This is the application-code half of the fix for the pre-Phase-3 role-aliasing bug. The
 * migration (0012's backfill) gave every *existing* organization its own role rows so editing one
 * organization's permissions could no longer silently change another's; this helper is what stops
 * every *new* organization from ever sharing a role row with anyone else in the first place. It
 * replaces the old pattern of looking up a single global `eq(roles.name, 'ADMIN')` row (what
 * db/seed.ts and organizations.service.ts's signup() both used to do) with "give this org its own
 * copy, then use that."
 *
 * Idempotent and safe to call more than once for the same organization: an existing role (matched
 * by organizationId + name) is reused rather than duplicated, and only missing permission grants
 * are added on a repeat call — the same idempotency discipline as the rest of db/seed.ts.
 *
 * Assumes the global `permissions` catalog (utils/permissions.ts's ALL_PERMISSIONS) has already
 * been seeded, which is true in every environment that has ever run `npm run db:seed` (including
 * production, before Phase 2 signup or Phase 3 shipped). If a permission key referenced by
 * ROLE_PERMISSIONS isn't found in the catalog yet, that one grant is skipped rather than failing
 * the whole call — a missing catalog row is a deploy-ordering problem to fix separately, not a
 * reason to block a user from signing up.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/config/db';
import { permissions, rolePermissions, roles } from '@/db/schema';
import { DEFAULT_ROLE_DESCRIPTIONS, DEFAULT_ROLE_NAMES, ROLE_PERMISSIONS, type PermissionKey } from '@/utils/permissions';

type Role = typeof roles.$inferSelect;

export async function seedDefaultRolesForOrganization(organizationId: string): Promise<Map<string, Role>> {
  const roleByName = new Map<string, Role>();

  const allKeys = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat())) as PermissionKey[];
  const permissionRows = allKeys.length ? await db.query.permissions.findMany({ where: inArray(permissions.key, allKeys) }) : [];
  const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));

  for (const roleName of DEFAULT_ROLE_NAMES) {
    let role = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, organizationId), eq(roles.name, roleName)) });
    if (!role) {
      const [created] = await db
        .insert(roles)
        .values({ organizationId, name: roleName, description: DEFAULT_ROLE_DESCRIPTIONS[roleName] })
        .returning();
      role = created;
    }
    roleByName.set(roleName, role);

    const existingGrants = await db.query.rolePermissions.findMany({ where: eq(rolePermissions.roleId, role.id) });
    const existingPermissionIds = new Set(existingGrants.map((g) => g.permissionId));

    const toGrant = ROLE_PERMISSIONS[roleName]
      .map((key) => permissionByKey.get(key))
      .filter((p): p is NonNullable<typeof p> => !!p && !existingPermissionIds.has(p.id));

    if (toGrant.length) {
      await db.insert(rolePermissions).values(toGrant.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    }
  }

  return roleByName;
}
