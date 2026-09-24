import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { pool } from '@/config/db';
import { runDueWebhookDeliveries } from './webhooks.service';

// Phase 15 (scale readiness) — see sequenceScheduler.ts's SCHEDULER_LOCK_KEY comment for the full
// rationale. Must never collide with that file's key (7501001).
const SCHEDULER_LOCK_KEY = 7501002;

/**
 * Phase 11 (API/integrations), slice 2 — outbound webhooks. Exactly the same in-process
 * `setInterval` pattern as modules/sequences/sequenceScheduler.ts, no new job-queue infrastructure
 * (see that file's own comment, and webhooks.service.ts's module comment). Started only from
 * server.ts (the real process entrypoint), never from app.ts — tests build the app via
 * `createApp()` directly and call runDueWebhookDeliveries() themselves when they need a delivery
 * processed, rather than waiting on a live timer.
 *
 * Phase 15 (scale readiness): same multi-replica double-delivery risk, same fix — a
 * pg_try_advisory_lock guard per tick, lock and unlock issued on one checked-out client so the
 * session-scoped lock can't be stranded on a different pooled connection. See
 * sequenceScheduler.ts's own comment for the full explanation.
 */
let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [SCHEDULER_LOCK_KEY]);
    if (!rows[0]?.locked) return; // another replica already holds it this tick — nothing to do here
    try {
      const { processed } = await runDueWebhookDeliveries();
      if (processed > 0) logger.info(`[webhookScheduler] attempted ${processed} due delivery(ies)`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startWebhookScheduler(): void {
  if (timer) return;
  const intervalMs = env.WEBHOOK_SCHEDULER_INTERVAL_SECONDS * 1000;
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, '[webhookScheduler] tick failed'));
  }, intervalMs);
  logger.info(`[webhookScheduler] started — checking every ${env.WEBHOOK_SCHEDULER_INTERVAL_SECONDS} second(s)`);
}

export function stopWebhookScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
