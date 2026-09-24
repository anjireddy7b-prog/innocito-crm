import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { TEST_ADMIN } from '../setup';

// Phase 15 (security hardening) — TOTP-based MFA. Isolated in its own file (vitest.config.ts's
// `pool: 'forks'` runs each test file in its own process) specifically to flip
// tokenEncryptionEnabled to false — every other test file relies on TOKEN_ENCRYPTION_KEY being
// set globally (see vitest.config.ts's own comment), so this is the one place
// auth.service.ts's requireEncryptionForMfa() OFF branch gets exercised at all. Same technique as
// connectorsEncryptionGate.test.ts.
vi.mock('@/config/env', async () => {
  const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env');
  return { ...actual, tokenEncryptionEnabled: false };
});

const { createApp } = await import('@/app');
const app = createApp();

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('MFA setup requires TOKEN_ENCRYPTION_KEY to be configured', () => {
  it('rejects starting MFA setup with a clear 400 when encryption is not configured', async () => {
    const res = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/TOKEN_ENCRYPTION_KEY/);
  });
});
