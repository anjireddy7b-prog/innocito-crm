import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/config/db';
import { logger } from '@/config/logger';
import { backfillPermissionCatalogAndDefaultRoleGrants } from '@/utils/permissionCatalogBackfill';
import { backfillPlatformAdmins } from '@/utils/platformAdminBackfill';

async function main() {
  logger.info('Running database migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  logger.info('Migrations complete.');

  // Runs on every boot (unlike db:seed, which is opt-in via RUN_SEED_ON_BOOT and is not set in
  // this project's production environment) — see permissionCatalogBackfill.ts for the bug this
  // closes: a phase that adds a new PERMISSIONS key otherwise never reaches an already-running
  // production database's permission catalog or its existing organizations' role grants.
  await backfillPermissionCatalogAndDefaultRoleGrants();

  // Phase 13 (super admin) — see platformAdminBackfill.ts's own comment for why this, too, runs
  // unconditionally on every boot rather than only at seed time.
  await backfillPlatformAdmins();

  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
