import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/config/db';
import { logger } from '@/config/logger';

async function main() {
  logger.info('Running database migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  logger.info('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
