import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 2: campaigns.code narrowed from platform-wide unique to unique-per-organization
// (see migration 0010_campaigns_code_per_org_unique.sql). This is the change self-service
// signup made necessary — a second real organization can now exist and would otherwise
// collide with org A's campaign codes.

let orgAToken: string;
let orgBToken: string;

beforeAll(async () => {
  const orgA = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  orgAToken = orgA.body.data.accessToken;
  const orgB = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBToken = orgB.body.data.accessToken;
});

describe('campaigns.code uniqueness is per-organization, not platform-wide', () => {
  it('two different organizations can each use the same campaign code', async () => {
    const code = `SHARED-${Date.now()}`;

    const orgARes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Org A Campaign', code });
    expect(orgARes.status).toBe(201);

    const orgBRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ name: 'Org B Campaign', code });
    expect(orgBRes.status).toBe(201);

    expect(orgARes.body.data.id).not.toBe(orgBRes.body.data.id);
    expect(orgARes.body.data.code).toBe(code);
    expect(orgBRes.body.data.code).toBe(code);
  });

  it('the same organization cannot reuse a code across two campaigns', async () => {
    const code = `DUPE-${Date.now()}`;

    const first = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'First Campaign', code });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Second Campaign', code });
    // A DB-level unique-index violation surfaces as a 409 (conflict) or 500 depending on how
    // campaigns.service.ts handles it — assert it is NOT a silent 201 success either way, since
    // that would mean the per-org unique index isn't actually enforced.
    expect(second.status).not.toBe(201);
  });
});
