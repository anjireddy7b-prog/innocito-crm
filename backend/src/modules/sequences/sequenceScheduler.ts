import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { runDueSequenceSteps } from './sequences.service';

/**
 * Phase 9 ("advanced CRM" slice) — sequences, Stage 2. The in-process scheduler the user
 * explicitly signed off on instead of a new job-queue system (no BullMQ) — a plain `setInterval`
 * that reuses this same single Railway service, no new infrastructure. Started only from
 * server.ts (the real process entrypoint), never from app.ts — tests build the app via
 * `createApp()` directly and never import server.ts, so a test run never starts this timer and
 * never needs to stop it either.
 */
let timer: ReturnType<typeof setInterval> | null = null;

export function startSequenceScheduler(): void {
  if (timer) return;
  const intervalMs = env.SEQUENCE_SCHEDULER_INTERVAL_MINUTES * 60_000;
  timer = setInterval(() => {
    runDueSequenceSteps()
      .then(({ processed }) => {
        if (processed > 0) logger.info(`[sequenceScheduler] processed ${processed} due step(s)`);
      })
      .catch((err) => logger.error({ err }, '[sequenceScheduler] tick failed'));
  }, intervalMs);
  logger.info(`[sequenceScheduler] started — checking every ${env.SEQUENCE_SCHEDULER_INTERVAL_MINUTES} minute(s)`);
}

export function stopSequenceScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
