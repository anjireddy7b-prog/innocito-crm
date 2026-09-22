import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';

const app = createApp();

// Split out from organizations.test.ts specifically because signupLimiter caps this file's IP
// at 5 signup requests/hour (see rateLimiter.ts): these two behaviors need either an extra
// request (the collision test) or to deliberately exhaust the budget (the rate-limit test),
// and vitest's `forks` pool gives every test file its own process — and therefore its own
// fresh in-memory rate-limit counter — so isolating them here keeps organizations.test.ts's
// functional tests from ever seeing a spurious 429.
function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function signupPayload(overrides: Partial<Record<string, string>> = {}) {
  return {
    organizationName: unique('Org'),
    firstName: 'First',
    lastName: 'Last',
    email: `${unique('user')}@example.com`,
    password: 'SuperSecret123',
    ...overrides,
  };
}

describe('POST /api/organizations/signup — slug collisions', () => {
  it('auto-derived slug collisions get a numeric suffix instead of a conflict', async () => {
    const name = unique('Collider Corp');
    const first = await request(app).post('/api/organizations/signup').send(signupPayload({ organizationName: name }));
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/organizations/signup').send(signupPayload({ organizationName: name }));
    expect(second.status).toBe(201);
    expect(second.body.data.organization.slug).not.toBe(first.body.data.organization.slug);
    expect(second.body.data.organization.slug).toMatch(new RegExp(`^${first.body.data.organization.slug}-\\d+$`));
  });
});

describe('POST /api/organizations/signup — rate limiting', () => {
  it('rate-limits repeated signup attempts from the same client', async () => {
    // signupLimiter allows 5 requests/hour; the slug-collision test above already used 2 of
    // that budget for this process's IP. Fire enough additional requests to guarantee the
    // limit is hit regardless of exactly how much budget remains, without asserting an exact
    // attempt count (that would over-couple to limiter internals).
    let sawLimited = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).post('/api/organizations/signup').send(signupPayload());
      if (res.status === 429) {
        sawLimited = true;
        break;
      }
    }
    expect(sawLimited).toBe(true);
  });
});
