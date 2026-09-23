import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { runDueWebhookDeliveries } from './webhooks.service';

/**
 * Phase 11 (API/integrations), slice 2 — outbound webhooks. Exactly the same in-process
 * `setInterval` pattern as modules/sequences/sequenceScheduler.ts, no new job-queue infrastructure
 * (see that file's own comment, and webhooks.service.ts's module comment). Started only from
 * server.ts (the real process entrypoint), never from app.ts — tests build the app via
 * `createApp()` directly and call runDueWebhookDeliveries() themselves when they need a delivery
 * processed, rather than waiting on a live timer.
 */
let timer: ReturnType<typeof setInterval> | null = null;

export function startWebhookScheduler(): void {
  if (timer) return;
  const intervalMs = env.WEBHOOK_SCHEDULER_INTERVAL_SECONDS * 1000;
  timer = setInterval(() => {
    runDueWebhookDeliveries()
      .then(({ processed }) => {
        if (processed > 0) logger.info(`[webhookScheduler] attempted ${processed} due delivery(ies)`);
      })
      .catch((err) => logger.error({ err }, '[webhookScheduler] tick failed'));
  }, intervalMs);
  logger.info(`[webhookScheduler] started — checking every ${env.WEBHOOK_SCHEDULER_INTERVAL_SECONDS} second(s)`);
}

export function stopWebhookScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
