import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { pool } from '@/config/db';
import { runDueSequenceSteps } from './sequences.service';

// Phase 15 (scale readiness) — arbitrary, unique-within-this-app Postgres advisory lock key. Only
// meaningful relative to webhookScheduler.ts's own key (7501002) — the two must never collide,
// since they'd then take turns blocking each other's ticks for no reason. Not derived from
// anything (like hashtext(tablename)); just a fixed constant, same as any other lock key.
const SCHEDULER_LOCK_KEY = 7501001;

/**
 * Phase 9 ("advanced CRM" slice) — sequences, Stage 2. The in-process scheduler the user
 * explicitly signed off on instead of a new job-queue system (no BullMQ) — a plain `setInterval`
 * that reuses this same single Railway service, no new infrastructure. Started only from
 * server.ts (the real process entrypoint), never from app.ts — tests build the app via
 * `createApp()` directly and never import server.ts, so a test run never starts this timer and
 * never needs to stop it either.
 *
 * Phase 15 (scale readiness): that "single Railway service" assumption was fine when this shipped,
 * but if the backend is ever scaled to more than one replica, EVERY replica runs this same timer
 * independently — each would find the same due steps and could each send the same email to the
 * same lead around the same moment. Rather than introducing a job queue (still explicitly out of
 * scope — see above), each tick first takes a short-lived Postgres advisory lock
 * (pg_try_advisory_lock) on the one Postgres database every replica already shares — a
 * zero-new-infrastructure mutex. Exactly one replica's tick proceeds per interval; every other
 * replica's pg_try_advisory_lock call returns false immediately (it never blocks/queues) and that
 * replica's tick just no-ops. Advisory locks are session-scoped, so the lock and its unlock are
 * issued on the SAME checked-out client deliberately — going through the shared `db`/pool for
 * either call could hand the unlock to a different pooled connection and leave the lock stuck
 * held (by an idle connection) until that connection eventually closes.
 */
let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [SCHEDULER_LOCK_KEY]);
    if (!rows[0]?.locked) return; // another replica already holds it this tick — nothing to do here
    try {
      const { processed } = await runDueSequenceSteps();
      if (processed > 0) logger.info(`[sequenceScheduler] processed ${processed} due step(s)`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startSequenceScheduler(): void {
  if (timer) return;
  const intervalMs = env.SEQUENCE_SCHEDULER_INTERVAL_MINUTES * 60_000;
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, '[sequenceScheduler] tick failed'));
  }, intervalMs);
  logger.info(`[sequenceScheduler] started — checking every ${env.SEQUENCE_SCHEDULER_INTERVAL_MINUTES} minute(s)`);
}

export function stopSequenceScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
