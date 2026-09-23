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
      // Set so tokenCrypto.test.ts can exercise real encrypt/decrypt round trips. Deliberately the
      // ONLY Phase 9 "sequences" env var set here — no GOOGLE_*/MICROSOFT_* vars are set, so
      // googleOAuthEnabled/microsoftOAuthEnabled stay false in every test (each also requires its
      // own three provider-specific vars, not just this key) and integrations.test.ts's "both
      // providers report unconfigured" assertions hold without any mocking.
      TOKEN_ENCRYPTION_KEY: 'wyPn2YTHDQx3OENm20nSh9U123TOQZtkDvqaEr2Lp3Y=',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
