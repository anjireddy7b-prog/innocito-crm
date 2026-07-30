import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    pool: 'forks', // isolate DB state between test files
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/innocito_crm_test?schema=public',
      REDIS_URL: '',
      JWT_ACCESS_SECRET: 'test-access-secret-not-for-production-use-only',
      JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-production-use-only',
      UPLOAD_DIR: './tests/tmp-uploads',
      SEED_ADMIN_EMAIL: 'admin@innocito.com',
      SEED_ADMIN_PASSWORD: 'ChangeMe!123',
      LOG_LEVEL: 'silent',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
