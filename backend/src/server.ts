import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { pool } from '@/config/db';
import { startSequenceScheduler, stopSequenceScheduler } from '@/modules/sequences/sequenceScheduler';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Innocito CRM API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Started here (the real process
// entrypoint), not in app.ts — app.ts is also what tests build via createApp(), and a test run
// must never have a live timer sending real emails in the background.
startSequenceScheduler();

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  stopSequenceScheduler();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
