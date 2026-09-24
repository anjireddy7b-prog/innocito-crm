/**
 * Phase 13 (super admin). Same rationale and "runs on every db:migrate" placement as
 * permissionCatalogBackfill.ts: PLATFORM_ADMIN_EMAILS (config/env.ts) is how an operator grants
 * platform-wide, cross-tenant access, and this is what actually applies it to the database —
 * editing the env var alone changes nothing until this runs, which docker-entrypoint.sh already
 * guarantees on every boot (see db/migrate.ts). Fully idempotent: promotes any matching user who
 * isn't already isPlatformAdmin, and never demotes anyone whose email was later removed from the
 * list (a platform admin's access is revoked deliberately — see platformAdmin.service.ts's
 * setOrganizationActive for the parallel "explicit action, not env-var drift" pattern — not by an
 * env var edit that could be a typo).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { users } from '@/db/schema';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

export async function backfillPlatformAdmins(): Promise<void> {
  if (!env.PLATFORM_ADMIN_EMAILS) return;

  const emails = env.PLATFORM_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  let promoted = 0;

  for (const email of emails) {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) {
      logger.warn(`Platform admin backfill: no user found for ${email} — skipping. It will be picked up once that account exists.`);
      continue;
    }
    if (user.isPlatformAdmin) continue;
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    promoted += 1;
  }

  if (promoted > 0) {
    logger.info(`Platform admin backfill: promoted ${promoted} user(s) to isPlatformAdmin.`);
  }
}
