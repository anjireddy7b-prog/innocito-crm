import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN } from '../setup';

const app = createApp();

// Phase 2: self-service organization signup + org profile self-management. TEST_ADMIN /
// the seeded fixtures already occupy "Test Org" / "test-org", so every test below picks its
// own randomized organization name/slug/email to avoid colliding with setup.ts's fixtures or
// with each other (vitest runs tests within a file sequentially, but stays defensive anyway).
function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// signupLimiter caps this whole file's own IP at 5 requests/hour (see rateLimiter.ts), and
// express-rate-limit counts every request that reaches it — including ones that fail
// validation or conflict — not just successful signups. The tests below are deliberately kept
// to exactly 5 signup POSTs total so none of them spuriously see a 429 from an earlier test's
// budget consumption. Slug-collision-suffix behavior and the limiter's own 429 behavior are
// covered separately in organizationsSignupLimits.test.ts, which gets a fresh in-memory
// counter (vitest's `forks` pool runs each test file in its own process).
describe('POST /api/organizations/signup', () => {
  it('creates a new organization + admin user, derives a URL-safe slug, and returns a working session', async () => {
    const email = `${unique('founder')}@example.com`;
    const res = await request(app).post('/api/organizations/signup').send({
      organizationName: 'Acme & Sons, Inc.',
      firstName: 'Ada',
      lastName: 'Founder',
      email,
      password: 'SuperSecret123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.organization.id).toBeTruthy();
    expect(res.body.data.organization.slug).toMatch(/^acme-sons-inc/);
    expect(res.body.data.user.email).toBe(email.toLowerCase());
    expect(res.body.data.user.role).toBe('ADMIN');
    // The bug caught during implementation: permissions must be populated immediately, not
    // empty until the next token refresh.
    expect(res.body.data.user.permissions).toContain('users:manage');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    // A refresh token cookie should be set, exactly like login.
    expect(res.headers['set-cookie']?.some((c: string) => c.startsWith('refresh_token='))).toBe(true);

    // The returned access token must actually work against a protected route.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email.toLowerCase());
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app).post('/api/organizations/signup').send({
      organizationName: unique('Dup Co'),
      firstName: 'Cee',
      lastName: 'Dup',
      email: TEST_ADMIN.email, // already seeded in setup.ts
      password: 'SuperSecret123',
    });
    expect(res.status).toBe(409);
  });

  it('rejects an explicitly-chosen slug that is already taken, without silently renaming it', async () => {
    const slug = unique('taken-slug');
    const first = await request(app).post('/api/organizations/signup').send({
      organizationName: 'First Org',
      slug,
      firstName: 'Dee',
      lastName: 'First',
      email: `${unique('first')}@example.com`,
      password: 'SuperSecret123',
    });
    expect(first.status).toBe(201);
    expect(first.body.data.organization.slug).toBe(slug);

    const second = await request(app).post('/api/organizations/signup').send({
      organizationName: 'Second Org',
      slug,
      firstName: 'Eve',
      lastName: 'Second',
      email: `${unique('second')}@example.com`,
      password: 'SuperSecret123',
    });
    expect(second.status).toBe(409);
  });

  it('rejects malformed payloads (validation middleware)', async () => {
    const res = await request(app).post('/api/organizations/signup').send({ organizationName: 'X' });
    expect(res.status).toBe(400);
  });
});

describe('GET/PATCH /api/organizations/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/organizations/me');
    expect(res.status).toBe(401);
  });

  it("returns the caller's own organization", async () => {
    const login = await request(app).post('/api/auth/login').send(TEST_ADMIN);
    const token = login.body.data.accessToken;

    const res = await request(app).get('/api/organizations/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('test-org');
  });

  it('lets an ADMIN rename their organization', async () => {
    const login = await request(app).post('/api/auth/login').send(TEST_ADMIN);
    const token = login.body.data.accessToken;
    const newName = unique('Renamed Org');

    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(newName);

    // Revert so later tests in this file that assume "Test Org" / "test-org" still pass.
    const revert = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Org' });
    expect(revert.status).toBe(200);
  });

  it('rejects a non-admin trying to update the organization', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'sales@innocito.com', password: 'Welcome@123' });
    const token = login.body.data.accessToken;

    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hijacked Name' });
    expect(res.status).toBe(403);
  });

  it('rejects renaming to a slug already used by another organization', async () => {
    const login = await request(app).post('/api/auth/login').send(TEST_ADMIN);
    const token = login.body.data.accessToken;

    // 'other-tenant' is seeded in setup.ts as the second tenant's slug.
    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'other-tenant' });
    expect(res.status).toBe(409);
  });

  it('rejects an empty update payload', async () => {
    const login = await request(app).post('/api/auth/login').send(TEST_ADMIN);
    const token = login.body.data.accessToken;

    const res = await request(app).patch('/api/organizations/me').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});
