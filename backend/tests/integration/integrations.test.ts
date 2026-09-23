import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { TEST_ADMIN } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
// connection infrastructure only). vitest.config.ts's test env sets no GOOGLE_*/MICROSOFT_* vars
// (only a TOKEN_ENCRYPTION_KEY, for tokenCrypto.test.ts — see that file's comment), so both
// providers report "unconfigured" here without any mocking, exactly like production would report
// them before the user's Google Cloud/Azure app registrations are created. Real Google/Microsoft
// token exchange therefore cannot be exercised in this sandbox at all (no legitimate outbound
// calls to those providers from CI) — this file only covers what's reachable without them: auth
// gating, the status shape, disconnect idempotency, and the callback route's redirect-on-failure
// behavior when state/code are missing or invalid.

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('Integrations — auth gating', () => {
  it('rejects an unauthenticated status check', async () => {
    const res = await request(app).get('/api/integrations/status');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated connect-url request', async () => {
    const res = await request(app).get('/api/integrations/google/connect-url');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated disconnect', async () => {
    const res = await request(app).delete('/api/integrations/connection');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated test-send', async () => {
    const res = await request(app).post('/api/integrations/test-send');
    expect(res.status).toBe(401);
  });
});

describe('Integrations — status', () => {
  it('reports both providers as unconfigured and no connection when nothing is set up', async () => {
    const res = await request(app).get('/api/integrations/status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.google.configured).toBe(false);
    expect(res.body.data.microsoft.configured).toBe(false);
    expect(res.body.data.connection).toBeNull();
  });
});

describe('Integrations — connect-url on an unconfigured provider', () => {
  it('refuses to build a Google connect URL when Google is not server-configured', async () => {
    const res = await request(app).get('/api/integrations/google/connect-url').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Google integration is not configured/i);
  });

  it('refuses to build a Microsoft connect URL when Microsoft is not server-configured', async () => {
    const res = await request(app).get('/api/integrations/microsoft/connect-url').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Microsoft integration is not configured/i);
  });
});

describe('Integrations — disconnect', () => {
  it('is idempotent — disconnecting when no connection exists still succeeds', async () => {
    const res = await request(app).delete('/api/integrations/connection').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});

describe('Integrations — test-send falls back to SMTP (unconfigured, so no provider connection exists)', () => {
  it('succeeds via the SMTP dry-run path since no connection and no real SMTP are configured', async () => {
    const res = await request(app).post('/api/integrations/test-send').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });
});

describe('Integrations — OAuth callback failure redirects (never a raw JSON error to a browser navigation)', () => {
  it('redirects with an error indicator when code/state are missing', async () => {
    const res = await request(app).get('/api/integrations/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('connected=error');
    expect(res.headers.location).toContain('provider=google');
  });

  it('redirects with an error indicator when the provider itself reports an error', async () => {
    const res = await request(app).get('/api/integrations/microsoft/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('connected=error');
    expect(res.headers.location).toContain('provider=microsoft');
  });

  it('redirects with an error indicator when state is present but invalid/unverifiable', async () => {
    const res = await request(app).get('/api/integrations/google/callback?code=abc123&state=not-a-real-jwt');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('connected=error');
  });

  it("rejects a well-formed state token signed for a different provider than the callback it's used on", async () => {
    // Replicates the exact shape integrations.service.ts's signState produces, signed with the
    // same JWT_ACCESS_SECRET the test env sets — proving verifyState's provider-mismatch check
    // fires even for an otherwise validly-signed, non-expired token, not just a garbage string.
    const stateForGoogle = jwt.sign({ purpose: 'oauth_connect', sub: 'some-user-id', provider: 'GOOGLE' }, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
    const res = await request(app).get(`/api/integrations/microsoft/callback?code=abc123&state=${stateForGoogle}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('connected=error');
    expect(res.headers.location).toContain('provider=microsoft');
  });

  it('rejects a state token with the wrong purpose (not one of ours)', async () => {
    const wrongPurpose = jwt.sign({ purpose: 'something_else', sub: 'some-user-id', provider: 'GOOGLE' }, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
    const res = await request(app).get(`/api/integrations/google/callback?code=abc123&state=${wrongPurpose}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('connected=error');
  });
});
