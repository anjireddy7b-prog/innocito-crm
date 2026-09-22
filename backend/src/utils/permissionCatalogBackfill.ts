/**
 * Closes a real production gap found after Phase 4/5/6 shipped: every phase that adds a brand-new
 * `PERMISSIONS` key (CUSTOM_FIELDS_MANAGE in Phase 4, CUSTOM_OBJECTS_MANAGE in Phase 5, and so on)
 * relies on `seedRolesAndPermissions`/`seedDefaultRolesForOrganization` (db/seed.ts,
 * utils/defaultRoles.ts) to (a) insert the new key into the global `permissions` catalog table and
 * (b) grant it to each organization's ADMIN (and other default) role via `role_permissions`. But
 * `db/seed.ts` only runs on boot when `RUN_SEED_ON_BOOT=true` (see
 * docker-entrypoint.sh) — which this project's production environment does not set. So every phase
 * since Phase 3 shipped its new permission(s) to the CODE, but never to the already-running
 * production database's catalog or its existing organizations' role grants. The symptom: an
 * existing org's Admin sees no "Customization" nav item, no Custom Objects, nothing gated by a
 * post-launch permission — the frontend correctly hides UI the signed-in user's JWT doesn't carry
 * the permission for; the JWT is correct for what the database actually granted, which is stale.
 *
 * The durable fix: run this on EVERY `npm run db:migrate` invocation (called from db/migrate.ts,
 * which docker-entrypoint.sh always runs on every boot, unlike db:seed). It is fully idempotent and
 * cheap — bounded by (organizations × default roles × permissions), all indexed lookups — so
 * running it unconditionally on every deploy is safe and means this exact class of bug can never
 * recur for a future phase's new permission either.
 *
 * Deliberately scoped to organizations' DEFAULT_ROLE_NAMES roles only (ADMIN, INSIDE_SALES, SALES,
 * DELIVERY, MANAGEMENT) — a tenant's own custom roles (Phase 3) are admin-controlled data and this
 * must never silently add grants to those.
 */
import { db } from '@/config/db';
import { organizations, permissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ALL_PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@/utils/permissions';
import { seedDefaultRolesForOrganization } from '@/utils/defaultRoles';
import { logger } from '@/config/logger';

export async function backfillPermissionCatalogAndDefaultRoleGrants(): Promise<void> {
  let catalogInsertCount = 0;
  for (const key of ALL_PERMISSIONS) {
    const existing = await db.query.permissions.findFirst({ where: eq(permissions.key, key) });
    if (existing) continue;
    await db.insert(permissions).values({ key, description: PERMISSION_DESCRIPTIONS[key] });
    catalogInsertCount += 1;
  }
  if (catalogInsertCount > 0) {
    logger.info(`Permission catalog backfill: inserted ${catalogInsertCount} missing permission key(s).`);
  }

  const allOrgs = await db.query.organizations.findMany({ columns: { id: true } });
  for (const org of allOrgs) {
    // Idempotent per-org: only inserts grants a role doesn't already have (see defaultRoles.ts).
    await seedDefaultRolesForOrganization(org.id);
  }
  logger.info(`Permission catalog backfill: checked default-role grants for ${allOrgs.length} organization(s).`);
}
