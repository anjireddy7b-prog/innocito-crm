import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '@/app';
import { db } from '@/config/db';
import { sequenceEnrollments, sequenceSends } from '@/db/schema';
import { runDueSequenceSteps } from '@/modules/sequences/sequences.service';
import { TEST_INSIDE_SALES } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Calls runDueSequenceSteps() directly
// rather than waiting on the real setInterval scheduler (sequenceScheduler.ts, which only ever
// starts from server.ts — never imported here). Every send in this file goes through the SMTP
// dry-run path (no OAuth connection exists for TEST_INSIDE_SALES, and SMTP itself is unconfigured
// in the test env — see vitest.config.ts), so it always "succeeds" without a real network call;
// that's also why the FAILED/auto-pause branch isn't exercised here — see
// tests/unit/sequenceScheduling.test.ts for that branch's decision logic (shouldAutoPause), and
// tests/unit/emailSender.test.ts for the mocked SMTP-fallback-vs-provider branch itself. Actually
// triggering a real send failure isn't reproducible in this sandbox, the same class of limitation
// documented for real OAuth token exchange in integrations.test.ts.

let insideSalesToken: string;
let leadId: string;

beforeAll(async () => {
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;

  const stamp = Date.now().toString(36);
  const leadRes = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${insideSalesToken}`)
    .send({ companyName: `Engine Test Co ${stamp}`, contact: { firstName: 'Engine', lastName: 'Test', email: `engine.test.${stamp}@example.com` } });
  leadId = leadRes.body.data.id;
});

async function createActiveSequenceWithSteps(stepCount: number) {
  const seqRes = await request(app).post('/api/sequences').set('Authorization', `Bearer ${insideSalesToken}`).send({ name: `Engine sequence ${Date.now()}` });
  const sequenceId = seqRes.body.data.id;
  for (let i = 0; i < stepCount; i += 1) {
    await request(app)
      .post(`/api/sequences/${sequenceId}/steps`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ subject: `Step ${i + 1}`, body: `Body ${i + 1}`, delayDays: 0 });
  }
  await request(app).patch(`/api/sequences/${sequenceId}`).set('Authorization', `Bearer ${insideSalesToken}`).send({ status: 'ACTIVE' });
  return sequenceId;
}

describe('Sequence engine — runDueSequenceSteps', () => {
  it('does nothing for an enrollment whose nextSendAt is in the future', async () => {
    const sequenceId = await createActiveSequenceWithSteps(1);
    const enrollRes = await request(app).post(`/api/sequences/${sequenceId}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId });
    const enrollmentId = enrollRes.body.data.id;
    // Push it into the future so this tick shouldn't touch it.
    await db.update(sequenceEnrollments).set({ nextSendAt: new Date(Date.now() + 3_600_000) }).where(eq(sequenceEnrollments.id, enrollmentId));

    await runDueSequenceSteps();

    const after = await db.query.sequenceEnrollments.findFirst({ where: eq(sequenceEnrollments.id, enrollmentId) });
    expect(after!.status).toBe('ACTIVE');
    const sends = await db.query.sequenceSends.findMany({ where: eq(sequenceSends.enrollmentId, enrollmentId) });
    expect(sends).toHaveLength(0);
  });

  it('sends the due step, logs a SENT row, and advances to the next step', async () => {
    const sequenceId = await createActiveSequenceWithSteps(2);
    const enrollRes = await request(app).post(`/api/sequences/${sequenceId}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId });
    const enrollmentId = enrollRes.body.data.id;
    const firstStepId = enrollRes.body.data.currentStepId;
    // Make it due now (enrollment computed nextSendAt for "now", which may itself already be due
    // if inside the send window — force it due regardless of the window/day the test happens to
    // run on).
    await db.update(sequenceEnrollments).set({ nextSendAt: new Date(Date.now() - 1000) }).where(eq(sequenceEnrollments.id, enrollmentId));

    const result = await runDueSequenceSteps();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const after = await db.query.sequenceEnrollments.findFirst({ where: eq(sequenceEnrollments.id, enrollmentId) });
    expect(after!.status).toBe('ACTIVE');
    expect(after!.currentStepId).not.toBe(firstStepId);
    expect(after!.nextSendAt).toBeTruthy();

    const sends = await db.query.sequenceSends.findMany({ where: eq(sequenceSends.enrollmentId, enrollmentId) });
    expect(sends).toHaveLength(1);
    expect(sends[0].status).toBe('SENT');
    expect(sends[0].stepId).toBe(firstStepId);
  });

  it('completes the enrollment after the last step is sent', async () => {
    const sequenceId = await createActiveSequenceWithSteps(1);
    const enrollRes = await request(app).post(`/api/sequences/${sequenceId}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId });
    const enrollmentId = enrollRes.body.data.id;
    await db.update(sequenceEnrollments).set({ nextSendAt: new Date(Date.now() - 1000) }).where(eq(sequenceEnrollments.id, enrollmentId));

    await runDueSequenceSteps();

    const after = await db.query.sequenceEnrollments.findFirst({ where: eq(sequenceEnrollments.id, enrollmentId) });
    expect(after!.status).toBe('COMPLETED');
    expect(after!.currentStepId).toBeNull();
    expect(after!.nextSendAt).toBeNull();
    expect(after!.completedAt).toBeTruthy();
  });

  it('a PAUSED enrollment is never picked up even if its (stale) nextSendAt is in the past', async () => {
    const sequenceId = await createActiveSequenceWithSteps(1);
    const enrollRes = await request(app).post(`/api/sequences/${sequenceId}/enrollments`).set('Authorization', `Bearer ${insideSalesToken}`).send({ leadId });
    const enrollmentId = enrollRes.body.data.id;
    await request(app).patch(`/api/sequences/enrollments/${enrollmentId}/pause`).set('Authorization', `Bearer ${insideSalesToken}`);
    // Force a past nextSendAt directly, bypassing the pause route's own null-out, to prove the
    // engine's query filters on status, not just staleness of the timestamp.
    await db.update(sequenceEnrollments).set({ nextSendAt: new Date(Date.now() - 1000) }).where(eq(sequenceEnrollments.id, enrollmentId));

    await runDueSequenceSteps();

    const sends = await db.query.sequenceSends.findMany({ where: eq(sequenceSends.enrollmentId, enrollmentId) });
    expect(sends).toHaveLength(0);
  });
});
