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
      // Phase 12 (billing/subscriptions). Dummy values (never real Stripe credentials) set
      // globally so billingEnabled is true in every test file by default — billing.test.ts then
      // mocks the `stripe` package itself (vi.mock('stripe', ...)) to exercise the "configured"
      // path without ever making a real network call. billingDisabledGate.test.ts is the one
      // isolated exception (vitest.config.ts's `pool: 'forks'` runs each test file in its own
      // process — same technique as connectorsEncryptionGate.test.ts), where it mocks
      // '@/config/env' to flip billingEnabled back to false and exercises the "not configured"
      // 400 path instead.
      STRIPE_SECRET_KEY: 'sk_test_dummy_not_a_real_key',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy_not_a_real_secret',
      STRIPE_PRO_PRICE_ID: 'price_dummy_pro',
      STRIPE_ENTERPRISE_PRICE_ID: 'price_dummy_enterprise',
      // Phase 14 (AI). Dummy value (never a real Anthropic key) set globally so aiEnabled is true
      // in every test file by default — same pattern as STRIPE_SECRET_KEY above. ai.test.ts then
      // mocks the `@anthropic-ai/sdk` package itself to exercise the "configured" path;
      // aiDisabledGate.test.ts is the one isolated exception, mocking '@/config/env' to flip
      // aiEnabled back to false.
      ANTHROPIC_API_KEY: 'sk-ant-dummy-not-a-real-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
