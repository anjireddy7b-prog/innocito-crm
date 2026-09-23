import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN, primaryRoleIds } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2 (the engine itself, on top of Stage 1's
// OAuth connection infra). Covers the CRUD surface, its validations, and enrollment lifecycle.
// Actual step-sending/advancing is covered separately in sequenceEngine.test.ts (it calls
// runDueSequenceSteps() directly rather than waiting on the real scheduler interval).

let insideSalesToken: string; // has SEQUENCES_MANAGE
let managementToken: string; // lacks it
let orgBAdminToken: string;

let leadWithContactId: string;
let leadWithoutContactId: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  const adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const orgBAdmin = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBAdminToken = orgBAdmin.body.data.accessToken;

  const created = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'management.sequences-test@innocito.com', firstName: 'Seq', lastName: 'Manager', roleId: primaryRoleIds.MANAGEMENT });
  const managementLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'management.sequences-test@innocito.com', password: created.body.data.temporaryPassword });
  managementToken = managementLogin.body.data.accessToken;

  const stamp = Date.now().toString(36);
  const withContact = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${insideSalesToken}`)
    .send({ companyName: `Sequence Test Co ${stamp}`, contact: { firstName: 'With', lastName: 'Contact', email: `with.contact.${stamp}@example.com` } });
  leadWithContactId = withContact.body.data.id;

  const withoutContact = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${insideSalesToken}`)
    .send({ companyName: `No Contact Co ${stamp}` });
  leadWithoutContactId = withoutContact.body.data.id;
});

async function createDraftSequence(name: string) {
  const res = await request(app).post('/api/sequences').set('Authorization', `Bearer ${insideSalesToken}`).send({ name });
  return res.body.data;
}

async function addStep(sequenceId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/sequences/${sequenceId}/steps`)
    .set('Authorization', `Bearer ${insideSalesToken}`)
    .send({ subject: 'Step subject', body: 'Step body', delayDays: 0, ...overrides });
  return res.body.data as { steps: any[] };
}

describe('Sequences — permission gating', () => {
  it('rejects a caller without SEQUENCES_MANAGE on every route', async () => {
    const list = await request(app).get('/api/sequences').set('Authorization', `Bearer ${managementToken}`);
    expect(list.status).toBe(403);
    const create = await request(app).post('/api/sequences').set('Authorization', `Bearer ${managementToken}`).send({ name: 'Nope' });
    expect(create.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/sequences');
    expect(res.status).toBe(401);
  });
});

describe('Sequences — CRUD', () => {
  it('creates a sequence in DRAFT status', async () => {
    const seq = await createDraftSequence('Cold outreach v1');
    expect(seq.status).toBe('DRAFT');
    expect(seq.steps).toEqual([]);
  });

  it('cannot activate a sequence with no steps', async () => {
    const seq = await createDraftSequence('Empty sequence');
    const res = await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    expect(res.status).toBe(400);
  });

  it('can activate a sequence once it has a step', async () => {
    const seq = await createDraftSequence('Activatable sequence');
    await addStep(seq.id);
    const res = await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('lists sequences with step and active-enrollment counts', async () => {
    const seq = await createDraftSequence(`Listed sequence ${Date.now()}`);
    await addStep(seq.id);
    const res = await request(app).get('/api/sequences?pageSize=100').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.find((s: any) => s.id === seq.id);
    expect(found.stepCount).toBe(1);
    expect(found.activeEnrollmentCount).toBe(0);
  });

  it('refuses to delete a sequence with enrollment history, but archiving works', async () => {
    const seq = await createDraftSequence('Has enrollment history');
    await addStep(seq.id);
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });

    const deleteAttempt = await request(app).delete(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(deleteAttempt.status).toBe(409);

    const archive = await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ARCHIVED' });
    expect(archive.status).toBe(200);

    // Archiving must have exited the enrollment created above.
    const enrollments = await request(app).get(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(enrollments.body.data.every((e: any) => e.status === 'EXITED')).toBe(true);
  });

  it("never surfaces another organization's sequence", async () => {
    const seq = await createDraftSequence('Org A only');
    const res = await request(app).get(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Sequences — steps', () => {
  it('appends steps in order and supports moving them', async () => {
    const seq = await createDraftSequence('Multi-step sequence');
    const afterFirst = await addStep(seq.id, { subject: 'First' });
    const afterSecond = await addStep(seq.id, { subject: 'Second' });
    expect(afterSecond.steps.map((s: any) => s.subject)).toEqual(['First', 'Second']);

    const moveRes = await request(app)
      .post(`/api/sequences/${seq.id}/steps/${afterSecond.steps[1].id}/move`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ direction: 'up' });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.steps.map((s: any) => s.subject)).toEqual(['Second', 'First']);
    void afterFirst;
  });

  it('moving the first step up is a no-op, not an error', async () => {
    const seq = await createDraftSequence('Move edge case');
    const afterStep = await addStep(seq.id);
    const res = await request(app)
      .post(`/api/sequences/${seq.id}/steps/${afterStep.steps[0].id}/move`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ direction: 'up' });
    expect(res.status).toBe(200);
  });

  it('refuses to delete a step an in-flight enrollment is currently on', async () => {
    const seq = await createDraftSequence('Step deletion guard');
    const afterStep = await addStep(seq.id);
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });

    const deleteAttempt = await request(app)
      .delete(`/api/sequences/${seq.id}/steps/${afterStep.steps[0].id}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(deleteAttempt.status).toBe(409);
  });
});

describe('Sequences — enrollment validations', () => {
  it('refuses to enroll into a DRAFT sequence', async () => {
    const seq = await createDraftSequence('Still a draft');
    await addStep(seq.id);
    const res = await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });
    expect(res.status).toBe(400);
  });

  it('refuses to enroll a lead with no contact email', async () => {
    const seq = await createDraftSequence('Needs an email');
    await addStep(seq.id);
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    const res = await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithoutContactId });
    expect(res.status).toBe(400);
  });

  it('computes a nextSendAt within the send window on enrollment', async () => {
    const seq = await createDraftSequence('Computes next send');
    await addStep(seq.id, { delayDays: 0 });
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    const res = await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });
    expect(res.status).toBe(201);
    expect(res.body.data.nextSendAt).toBeTruthy();
    const hour = new Date(res.body.data.nextSendAt).getUTCHours();
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(18);
  });

  it('refuses a second ACTIVE/PAUSED enrollment of the same lead into the same sequence', async () => {
    const seq = await createDraftSequence('No duplicate enrollment');
    await addStep(seq.id);
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });
    const second = await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });
    expect(second.status).toBe(409);
  });
});

describe('Sequences — enrollment lifecycle', () => {
  it('pause -> resume -> exit transitions work, and invalid transitions are rejected', async () => {
    const seq = await createDraftSequence('Lifecycle sequence');
    await addStep(seq.id);
    await request(app).patch(`/api/sequences/${seq.id}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
    const enrollRes = await request(app).post(`/api/sequences/${seq.id}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId: leadWithContactId });
    const enrollmentId = enrollRes.body.data.id;

    const pauseAgain = await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/resume`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(pauseAgain.status).toBe(400); // can't resume an ACTIVE enrollment

    const pause = await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/pause`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(pause.status).toBe(200);
    expect(pause.body.data.status).toBe('PAUSED');
    expect(pause.body.data.nextSendAt).toBeNull();

    const resume = await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/resume`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(resume.status).toBe(200);
    expect(resume.body.data.status).toBe('ACTIVE');
    expect(resume.body.data.nextSendAt).toBeTruthy();

    const exit = await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/exit`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(exit.status).toBe(200);
    expect(exit.body.data.status).toBe('EXITED');

    const exitAgain = await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/exit`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(exitAgain.status).toBe(400);
  });
});
