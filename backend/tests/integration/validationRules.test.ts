import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 8 ("process engines," synchronous validation-rule slice — see db/schema.ts's
// validationRules table comment for why workflow automation/approvals are deferred to a later
// increment). A rule is "when <field> <operator> [value], then <fields> are required," evaluated
// synchronously against a lead's fully-merged field values on every create/update/status-change.

let adminToken: string;
let insideSalesToken: string;
let orgBAdminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;
});

describe('Validation rules — CRUD and permissions', () => {
  it('a non-manager cannot list or create validation rules', async () => {
    const list = await request(app).get('/api/validation-rules?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ name: 'Attempted rule', whenField: 'status', whenOperator: 'is_set', thenRequireFields: ['category'] });
    expect(create.status).toBe(403);
  });

  it('rejects equals/not_equals without a comparison value', async () => {
    const res = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad rule', whenField: 'status', whenOperator: 'equals', thenRequireFields: ['category'] });
    expect(res.status).toBe(400);
  });

  it('an ADMIN can create, read, and list a rule', async () => {
    const create = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Won deals need a value and close date',
        whenField: 'status',
        whenOperator: 'equals',
        whenValue: 'WON',
        thenRequireFields: ['dealValue', 'expectedCloseDate'],
      });
    expect(create.status).toBe(201);
    expect(create.body.data.isActive).toBe(true);

    const getOne = await request(app).get(`/api/validation-rules/${create.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(getOne.status).toBe(200);

    const list = await request(app).get('/api/validation-rules?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.map((r: any) => r.name)).toContain('Won deals need a value and close date');

    // Clean up — the "enforcement on leads" tests below create their own WON-keyed rule and
    // assert on its specific errorMessage; leaving this one active would shadow it (it's older,
    // so it would be evaluated first) and would also block WON-lead creation in unrelated tests.
    await request(app).delete(`/api/validation-rules/${create.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('rejects a duplicate rule name for the same entityType', async () => {
    const original = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate rule name', whenField: 'status', whenOperator: 'is_set', thenRequireFields: ['category'] });

    const duplicate = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate rule name', whenField: 'priority', whenOperator: 'is_set', thenRequireFields: ['category'] });
    expect(duplicate.status).toBe(409);

    // Clean up — `status` is_set matches every lead (status always has a value), so leaving this
    // active would require `category` on every lead created by any later test in this file.
    await request(app).delete(`/api/validation-rules/${original.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('can update a rule, leaving omitted fields as-is, and can delete a rule', async () => {
    const create = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Editable rule',
        description: 'Original description',
        whenField: 'priority',
        whenOperator: 'equals',
        whenValue: 'HIGH',
        thenRequireFields: ['category'],
      });
    const id = create.body.data.id;

    const rename = await request(app)
      .patch(`/api/validation-rules/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Editable rule (renamed)' });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Editable rule (renamed)');
    // Omitted fields — description, whenValue, thenRequireFields — are left as-is.
    expect(rename.body.data.description).toBe('Original description');
    expect(rename.body.data.whenValue).toBe('HIGH');

    const del = await request(app).delete(`/api/validation-rules/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const getDeleted = await request(app).get(`/api/validation-rules/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(getDeleted.status).toBe(404);
  });

  it("a different organization's rules are invisible (404 on direct fetch, absent from list)", async () => {
    const create = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Org A only rule', whenField: 'status', whenOperator: 'is_set', thenRequireFields: ['category'] });
    const id = create.body.data.id;

    const orgBFetch = await request(app).get(`/api/validation-rules/${id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBFetch.status).toBe(404);

    const orgBList = await request(app).get('/api/validation-rules?entityType=LEAD').set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(orgBList.body.data.map((r: any) => r.name)).not.toContain('Org A only rule');

    // Clean up — same "status is_set always matches" reasoning as the duplicate-name test above.
    await request(app).delete(`/api/validation-rules/${id}`).set('Authorization', `Bearer ${adminToken}`);
  });
});

describe('Validation rules — enforcement on leads', () => {
  it('blocks creating a WON lead with no deal value or close date, per an active rule', async () => {
    const rule = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Won needs value and close date',
        whenField: 'status',
        whenOperator: 'equals',
        whenValue: 'WON',
        thenRequireFields: ['dealValue', 'expectedCloseDate'],
        errorMessage: 'Won leads need a deal value and an expected close date.',
      });

    const blocked = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'WON', source: 'EMAIL', priority: 'MEDIUM' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe('Won leads need a deal value and an expected close date.');

    const allowed = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'WON', source: 'EMAIL', priority: 'MEDIUM', dealValue: 5000, expectedCloseDate: '2026-01-01' });
    expect(allowed.status).toBe(201);

    // A NEW lead never matches a rule keyed on status = WON, so it's unaffected either way.
    const unaffected = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM' });
    expect(unaffected.status).toBe(201);

    // Clean up — the next test also drives a lead to WON, but only supplies dealValue (not
    // expectedCloseDate); leaving this rule active would make that unrelated test collide with it.
    await request(app).delete(`/api/validation-rules/${rule.body.data.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('blocks a PATCH that edits a lead INTO a matching, non-compliant state', async () => {
    await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Critical priority needs a category',
        whenField: 'priority',
        whenOperator: 'equals',
        whenValue: 'CRITICAL',
        thenRequireFields: ['category'],
      });

    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM' });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const blocked = await request(app)
      .patch(`/api/leads/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'CRITICAL' });
    expect(blocked.status).toBe(400);

    const allowed = await request(app)
      .patch(`/api/leads/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'CRITICAL', category: 'Escalation' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.priority).toBe('CRITICAL');
  });

  it('blocks a status-change (PATCH /:id/status) that would violate a rule — a separate mutation path from the general update', async () => {
    await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Won via status endpoint needs value',
        whenField: 'status',
        whenOperator: 'equals',
        whenValue: 'WON',
        thenRequireFields: ['dealValue'],
      });

    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM' });
    const id = create.body.data.id;

    const blockedStatusChange = await request(app)
      .patch(`/api/leads/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'WON' });
    expect(blockedStatusChange.status).toBe(400);

    await request(app).patch(`/api/leads/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ dealValue: 1200 });

    const allowedStatusChange = await request(app)
      .patch(`/api/leads/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'WON' });
    expect(allowedStatusChange.status).toBe(200);
    expect(allowedStatusChange.body.data.status).toBe('WON');
  });

  it('a whenField can be a custom field key, resolved the same way as a typed column (is_set operator)', async () => {
    await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'referral_code', label: 'Referral Code', fieldType: 'TEXT' });

    await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Referred leads need a category',
        whenField: 'referral_code',
        whenOperator: 'is_set',
        thenRequireFields: ['category'],
      });

    const blocked = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM', customFields: { referral_code: 'REF-123' } });
    expect(blocked.status).toBe(400);

    const allowed = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM', customFields: { referral_code: 'REF-123' }, category: 'Partner' });
    expect(allowed.status).toBe(201);

    // No referral_code at all — the rule's condition never matches, so category stays optional.
    const noReferral = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'MEDIUM' });
    expect(noReferral.status).toBe(201);
  });

  it('an inactive rule never blocks, even when its condition matches', async () => {
    const create = await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Disabled rule',
        whenField: 'priority',
        whenOperator: 'equals',
        whenValue: 'LOW',
        thenRequireFields: ['category'],
      });
    const id = create.body.data.id;

    await request(app).patch(`/api/validation-rules/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NEW', source: 'EMAIL', priority: 'LOW' });
    expect(res.status).toBe(201);
  });

  it("a rule in one organization never affects another organization's leads", async () => {
    await request(app)
      .post('/api/validation-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Org A exclusive rule',
        whenField: 'status',
        whenOperator: 'equals',
        whenValue: 'WON',
        thenRequireFields: ['dealValue'],
      });

    const orgBLead = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'WON', source: 'EMAIL', priority: 'MEDIUM' });
    expect(orgBLead.status).toBe(201);
  });
});
