import { describe, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { eq } from 'drizzle-orm';
import { createApp } from '@/app';
import { db } from '@/config/db';
import { users } from '@/db/schema';
import { primaryOrgId, primaryRoleIds } from '../setup';

// Phase 15 (security hardening) — TOTP-based MFA end-to-end: setup -> enable -> login now
// requires a code -> login-verify (TOTP or a backup code) -> disable. Every test below creates
// its OWN throwaway user (same discipline as authSessions.test.ts) rather than touching the
// shared TEST_ADMIN/TEST_SALES fixtures — enabling MFA on a shared fixture would strand every
// OTHER test in this file (and, in file-execution order, any later test in a shared-DB run) that
// expects to log that user in with just a password.

const app = createApp();

async function createUserAndLogin(email: string, password: string) {
  await db.insert(users).values({
    organizationId: primaryOrgId,
    email,
    passwordHash: await argon2.hash(password),
    firstName: 'Mfa',
    lastName: 'Test',
    roleId: primaryRoleIds.SALES,
    mustChangePassword: false,
    isActive: true,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe('MFA — setup and enable', () => {
  // Deliberately makes only ONE /api/auth/login call (inside createUserAndLogin) — this file's
  // authLimiter budget (middleware/rateLimiter.ts, a real 20-requests/15-minute limit even under
  // NODE_ENV=test, shared across every /login and /mfa/login-verify call THIS file makes, since
  // it's a module-level singleton for the whole forked test process — see rateLimiter.ts's own
  // comment on apiLimiter for the same "shared across the file" mechanism) is tight enough across
  // this file's ~10 tests that every test here counts its login/verify calls deliberately rather
  // than adding a "just to be sure" extra one.
  it('setup returns a secret and a scannable QR code; enabling with the wrong code is rejected', async () => {
    const token = await createUserAndLogin('mfa-setup-1@innocito.com', 'Welcome@123');

    const setup = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expect(setup.body.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const wrongEnable = await request(app)
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' });
    expect(wrongEnable.status).toBe(400);
  });

  it('enabling with the correct code turns MFA on and returns 8 one-time backup codes', async () => {
    const token = await createUserAndLogin('mfa-setup-2@innocito.com', 'Welcome@123');
    const setup = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${token}`);
    const code = authenticator.generate(setup.body.data.secret);

    const enable = await request(app)
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect(enable.status).toBe(200);
    expect(enable.body.data.backupCodes).toHaveLength(8);
    for (const c of enable.body.data.backupCodes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const row = await db.query.users.findFirst({ where: eq(users.email, 'mfa-setup-2@innocito.com') });
    expect(row?.mfaEnabled).toBe(true);
    expect(row?.mfaBackupCodes).toHaveLength(8);
  });
});

describe('MFA — login flow', () => {
  async function enableMfaFor(email: string, password: string) {
    const token = await createUserAndLogin(email, password);
    const setup = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${token}`);
    const secret = setup.body.data.secret;
    const code = authenticator.generate(secret);
    const enable = await request(app).post('/api/auth/mfa/enable').set('Authorization', `Bearer ${token}`).send({ code });
    return { secret, backupCodes: enable.body.data.backupCodes as string[] };
  }

  it('a subsequent login returns a challenge instead of a session, and sets no refresh cookie', async () => {
    await enableMfaFor('mfa-login-1@innocito.com', 'Welcome@123');

    const login = await request(app).post('/api/auth/login').send({ email: 'mfa-login-1@innocito.com', password: 'Welcome@123' });
    expect(login.status).toBe(200);
    expect(login.body.data.mfaRequired).toBe(true);
    expect(login.body.data.challengeToken).toBeTruthy();
    expect(login.body.data.accessToken).toBeUndefined();
    // A csrf_token cookie IS set on every response (middleware/csrf.ts) — only refresh_token is
    // what a real session would carry, and that's what must be absent here.
    expect(login.headers['set-cookie']?.some((c: string) => c.startsWith('refresh_token='))).toBeFalsy();
  });

  it('login-verify with the correct TOTP code completes login and sets the refresh cookie', async () => {
    const { secret } = await enableMfaFor('mfa-login-2@innocito.com', 'Welcome@123');
    const login = await request(app).post('/api/auth/login').send({ email: 'mfa-login-2@innocito.com', password: 'Welcome@123' });
    const challengeToken = login.body.data.challengeToken;

    const verify = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken, code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
    expect(verify.body.data.user.email).toBe('mfa-login-2@innocito.com');
    expect(verify.headers['set-cookie']?.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('login-verify with a wrong TOTP code is rejected with 401', async () => {
    await enableMfaFor('mfa-login-3@innocito.com', 'Welcome@123');
    const login = await request(app).post('/api/auth/login').send({ email: 'mfa-login-3@innocito.com', password: 'Welcome@123' });

    const verify = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken: login.body.data.challengeToken, code: '000000' });
    expect(verify.status).toBe(401);
  });

  it('login-verify with a garbage/expired challenge token is rejected with 401', async () => {
    const verify = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken: 'not-a-real-token', code: '123456' });
    expect(verify.status).toBe(401);
  });

  it('login-verify accepts a backup code, and that code can never be used a second time', async () => {
    const { backupCodes } = await enableMfaFor('mfa-login-4@innocito.com', 'Welcome@123');
    const login = await request(app).post('/api/auth/login').send({ email: 'mfa-login-4@innocito.com', password: 'Welcome@123' });
    // The challenge token itself isn't single-use (it's a stateless, short-lived JWT — see
    // utils/tokens.ts's own comment); what's single-use is each individual BACKUP CODE. Reusing
    // the same challengeToken for all three verify attempts below (rather than a fresh /login per
    // attempt) is deliberate — it's also what keeps this test's contribution to this file's
    // shared authLimiter budget small.
    const challengeToken = login.body.data.challengeToken;

    const firstUse = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken, code: backupCodes[0] });
    expect(firstUse.status).toBe(200);

    // Same backup code again — rejected, because it's already spent.
    const reuse = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken, code: backupCodes[0] });
    expect(reuse.status).toBe(401);

    // A DIFFERENT never-used backup code from the same original batch still works.
    const secondCode = await request(app)
      .post('/api/auth/mfa/login-verify')
      .send({ challengeToken, code: backupCodes[1] });
    expect(secondCode.status).toBe(200);
  });
});

describe('MFA — disable', () => {
  it('requires the correct current password, and turns login back to a plain (non-MFA) flow', async () => {
    const email = 'mfa-disable-1@innocito.com';
    const password = 'Welcome@123';
    const token = await createUserAndLogin(email, password);
    const setup = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${token}`);
    const code = authenticator.generate(setup.body.data.secret);
    await request(app).post('/api/auth/mfa/enable').set('Authorization', `Bearer ${token}`).send({ code });

    const wrongPassword = await request(app)
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'totally-wrong' });
    expect(wrongPassword.status).toBe(400);

    const disable = await request(app)
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password });
    expect(disable.status).toBe(200);

    const row = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(row?.mfaEnabled).toBe(false);
    expect(row?.mfaSecretEnc).toBeNull();
    expect(row?.mfaBackupCodes).toBeNull();

    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.mfaRequired).toBe(false);
    expect(login.body.data.accessToken).toBeTruthy();
  });
});
