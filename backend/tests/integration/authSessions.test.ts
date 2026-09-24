import { describe, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { createApp } from '@/app';
import { db } from '@/config/db';
import { users } from '@/db/schema';
import { TEST_ADMIN, TEST_INSIDE_SALES, primaryOrgId, primaryRoleIds } from '../setup';

// Phase 15 (security hardening). Two independent slices, each covered in its own describe block:
// account-lockout brute-force protection, and session/device listing + revocation. Its own file
// (rather than folding into auth.test.ts) so a lockout test's own 401s can never be mistaken for
// a regression in that file's existing "wrong password" assertions, and so nothing here risks
// leaving TEST_ADMIN locked out for a test that runs later in file-execution order — every lockout
// test below creates its OWN throwaway user rather than touching the shared TEST_ADMIN/
// TEST_INSIDE_SALES fixtures that other tests (including the session-management tests further
// down THIS file) still need to log in successfully.
const app = createApp();

function extractRefreshCookie(res: any): string {
  const raw = (res.headers['set-cookie'] as string[] | undefined)?.find((c) => c.startsWith('refresh_token='));
  if (!raw) throw new Error('Expected a refresh_token cookie on this response');
  return raw.split(';')[0]; // "refresh_token=<value>" — everything after the first ';' is cookie attributes (Path, HttpOnly, ...), not part of the value supertest/undici need to resend.
}

async function createThrowawayUser(email: string, password: string) {
  await db.insert(users).values({
    organizationId: primaryOrgId,
    email,
    passwordHash: await argon2.hash(password),
    firstName: 'Test',
    lastName: 'User',
    roleId: primaryRoleIds.SALES,
    mustChangePassword: false,
    isActive: true,
  });
}

describe('Account lockout (Phase 15, security hardening)', () => {
  it('locks the account after 5 consecutive failed logins, even with the correct password on the 6th attempt', async () => {
    const email = 'lockout-target@innocito.com';
    const password = 'CorrectPassword123';
    await createThrowawayUser(email, password);

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/too many failed login attempts/i);

    const row = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(row?.lockedUntil).toBeTruthy();
    // Reset to 0 on lock (not left at 5) — see auth.service.ts's own comment for why: so the
    // account unlocks with a full fresh budget once lockedUntil passes.
    expect(row?.failedLoginAttempts).toBe(0);
  });

  it('resets the failed-attempt counter on a successful login before the account ever locks', async () => {
    const email = 'lockout-reset@innocito.com';
    const password = 'CorrectPassword123';
    await createThrowawayUser(email, password);

    await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });

    const midway = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(midway?.failedLoginAttempts).toBe(2);

    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);

    const after = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(after?.failedLoginAttempts).toBe(0);
    expect(after?.lockedUntil).toBeNull();
  });
});

describe('Session/device management (Phase 15, security hardening)', () => {
  it('lists active sessions and flags exactly the caller\'s own current one', async () => {
    await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const second = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const secondCookie = extractRefreshCookie(second);

    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${second.body.data.accessToken}`)
      .set('Cookie', secondCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.filter((s: any) => s.current).length).toBe(1);
    expect(res.body.data.every((s: any) => typeof s.id === 'string' && 'ipAddress' in s && 'userAgent' in s)).toBe(true);
  });

  it('GET /api/auth/sessions still works with no refresh cookie at all — just nothing flagged current', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s: any) => s.current)).toBe(false);
  });

  it('revokes a specific session by id, and revoking the same id again 404s', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const cookie = extractRefreshCookie(login);
    const token = login.body.data.accessToken;

    const list = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`).set('Cookie', cookie);
    const target = list.body.data.find((s: any) => s.current);
    expect(target).toBeTruthy();

    const del = await request(app).delete(`/api/auth/sessions/${target.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const delAgain = await request(app).delete(`/api/auth/sessions/${target.id}`).set('Authorization', `Bearer ${token}`);
    expect(delAgain.status).toBe(404);
  });

  it('cannot revoke another user\'s session', async () => {
    const adminLogin = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const adminCookie = extractRefreshCookie(adminLogin);
    const adminList = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .set('Cookie', adminCookie);
    const adminSessionId = adminList.body.data.find((s: any) => s.current).id;

    const otherLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_INSIDE_SALES.email, password: TEST_INSIDE_SALES.password });

    const res = await request(app)
      .delete(`/api/auth/sessions/${adminSessionId}`)
      .set('Authorization', `Bearer ${otherLogin.body.data.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('revoke-others leaves the caller\'s current session intact and revokes every other one of theirs', async () => {
    await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const current = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const currentCookie = extractRefreshCookie(current);
    const currentToken = current.body.data.accessToken;

    const res = await request(app)
      .post('/api/auth/sessions/revoke-others')
      .set('Authorization', `Bearer ${currentToken}`)
      .set('Cookie', currentCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.revokedCount).toBeGreaterThan(0);

    const after = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${currentToken}`)
      .set('Cookie', currentCookie);
    expect(after.body.data.length).toBe(1);
    expect(after.body.data[0].current).toBe(true);
  });
});
