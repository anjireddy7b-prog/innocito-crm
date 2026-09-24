import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '@/app';
import { db } from '@/config/db';
import { ipAllowlistEntries } from '@/db/schema';
import { TEST_ADMIN, TEST_SALES, primaryOrgId } from '../setup';

// Phase 15 (security hardening) — CRUD + permission-gating + the lockout safety net for
// utils/ipAllowlist.ts's isIpAllowed/ipAllowlistEntries.service.ts. The matcher's own pure-function
// behavior (CIDR parsing, /0 and /32 boundaries, IPv4-mapped-IPv6 stripping) is covered separately
// in tests/unit/ipAllowlistMatcher.test.ts — this file only exercises the HTTP surface and the
// real test database. Every test here runs against `127.0.0.1`, since that's what supertest's
// in-process requests resolve to in this harness (confirmed empirically, not assumed).

const app = createApp();

let adminToken: string;
let salesToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
});

// Every test either creates no rows or cleans up after itself, but a failed assertion mid-test
// could still leave a stray row behind — belt-and-suspenders so no test in this file can ever
// observe leftover entries from a previous one (in particular, a leftover restrictive entry could
// silently start locking every OTHER test's own admin requests out too, since enforcement is
// app-wide).
afterEach(async () => {
  await db.delete(ipAllowlistEntries).where(eq(ipAllowlistEntries.organizationId, primaryOrgId));
});

describe('IP allowlist — permission gating', () => {
  it('rejects a non-admin (SALES, no IP_ALLOWLIST_MANAGE) with 403 on every route', async () => {
    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${salesToken}`);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ cidr: '203.0.113.0/24' });
    expect(create.status).toBe(403);

    const remove = await request(app)
      .delete('/api/ip-allowlist/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(remove.status).toBe(403);
  });
});

describe('IP allowlist — CRUD', () => {
  it('is empty by default, and an org with zero entries stays unrestricted', async () => {
    const res = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a malformed cidr with 400 and persists nothing', async () => {
    const res = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: 'not-an-ip' });
    expect(res.status).toBe(400);

    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toEqual([]);
  });

  it('creates an entry that covers the caller and can list/delete it', async () => {
    const create = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '127.0.0.1/32', label: 'office' });
    expect(create.status).toBe(201);
    expect(create.body.data.cidr).toBe('127.0.0.1/32');
    expect(create.body.data.label).toBe('office');

    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/ip-allowlist/${create.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(listAfter.body.data).toEqual([]);
  });

  it('deleting an unknown id returns 404', async () => {
    const res = await request(app)
      .delete('/api/ip-allowlist/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('IP allowlist — lockout safety net', () => {
  it('rejects creating a range that would exclude the caller\'s own IP, and persists nothing', async () => {
    const res = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '10.0.0.0/8', label: 'excludes 127.0.0.1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lock your whole organization out/i);

    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toEqual([]);
  });

  it('rejects deleting the only entry covering the caller while a non-covering one would remain, and restores it', async () => {
    // Two entries: one that covers the caller's real IP (127.0.0.1), one that doesn't. Deleting
    // the ONLY entry is always safe (zero rows = unrestricted again) — this test specifically
    // leaves the non-covering entry behind so the delete-time safety net actually has something
    // to trip on.
    const covering = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '127.0.0.1/32', label: 'covers me' });
    expect(covering.status).toBe(201);

    const nonCovering = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '198.51.100.0/24', label: 'does not cover me' });
    expect(nonCovering.status).toBe(201);

    const del = await request(app)
      .delete(`/api/ip-allowlist/${covering.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/lock your whole organization out/i);

    // Restored, not actually removed.
    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.map((e: { cidr: string }) => e.cidr).sort()).toEqual(['127.0.0.1/32', '198.51.100.0/24']);
  });

  it('allows deleting the only entry down to zero (always safe — returns to unrestricted)', async () => {
    const only = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '127.0.0.1/32' });
    expect(only.status).toBe(201);

    const del = await request(app)
      .delete(`/api/ip-allowlist/${only.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toEqual([]);
  });
});

describe('IP allowlist — enforcement', () => {
  // app.ts sets `trust proxy: 1`, so req.ip honors a single X-Forwarded-For hop — used here to
  // simulate a request from an IP outside the configured range without needing a real second
  // network interface. Confirmed empirically (throwaway probe, since deleted) that a bare
  // `X-Forwarded-For: <ip>` header becomes req.ip exactly under this app's trust-proxy setting.
  it('once an org has a restrictive entry, a request from a covered IP succeeds and one from an uncovered IP is rejected', async () => {
    const entry = await request(app)
      .post('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cidr: '127.0.0.1/32' });
    expect(entry.status).toBe(201);

    // Same-org SALES user logging in from the covered IP (the real, un-spoofed 127.0.0.1) still works.
    const login = await request(app).post('/api/auth/login').send(TEST_SALES);
    expect(login.status).toBe(200);

    // An authenticated request against the now-restricted org still succeeds from the covered IP.
    const authed = await request(app).get('/api/ip-allowlist').set('Authorization', `Bearer ${adminToken}`);
    expect(authed.status).toBe(200);

    // Spoofing an uncovered IP via X-Forwarded-For gets an already-valid access token rejected.
    const blocked = await request(app)
      .get('/api/ip-allowlist')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Forwarded-For', '203.0.113.9');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/not on this organization's allowed list/i);

    // Login itself is rejected from an uncovered IP too — not just the post-login enforcement.
    // (auth.service.ts's login uses ApiError.unauthorized here — 401, not the 403 the middleware
    // check above returns — so a disallowed network can't even tell IP-allowlisting apart from a
    // wrong password at the login step.)
    const blockedLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send(TEST_SALES);
    expect(blockedLogin.status).toBe(401);
  });
});
