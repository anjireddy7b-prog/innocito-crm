import { Request } from 'express';
import { and, asc, eq, gt, ilike, inArray, lte, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { sequences, sequenceSteps, sequenceEnrollments, sequenceSends, leads } from '@/db/schema';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { orgId } from '@/utils/tenant';
import { formatLeadNumber } from '@/utils/leadNumber';
import { computeNextSendAt, shouldAutoPause, MAX_CONSECUTIVE_SEND_FAILURES } from '@/utils/sequenceScheduling';
import { sendEmailAsUser } from '@/utils/emailSender';

/**
 * Phase 9 ("advanced CRM" slice) — sequences, Stage 2: the engine itself, built on top of Stage
 * 1's OAuth connection infrastructure (modules/integrations/*). A sequence is an org-wide,
 * reusable template — its `sequenceSteps` rows are live content, not a snapshot copied per
 * enrollment. That's a deliberate v1 simplification: editing an ACTIVE sequence's steps (subject,
 * body, or delay) changes what every in-flight enrollment sends next, since runDueSequenceSteps
 * below always reads the current step row at send time. Building step versioning/snapshotting so
 * an edit only affects FUTURE enrollments would be a legitimate improvement, but is its own
 * feature, not bundled into this one.
 *
 * Scope, all confirmed with the user before this was built: leads are enrolled manually only (no
 * rule-based auto-enrollment); a step's delay is counted in business days; sends are held to a
 * fixed send window (config/env.ts's SEQUENCE_SEND_WINDOW_*, UTC); no auto-pause-on-reply-detection
 * — pause/exit are always an explicit user action.
 */

const stepColumns = { id: true, sequenceId: true, stepOrder: true, delayDays: true, subject: true, body: true, createdAt: true, updatedAt: true } as const;

async function getOwnedSequence(org: string, id: string) {
  const sequence = await db.query.sequences.findFirst({ where: and(eq(sequences.organizationId, org), eq(sequences.id, id)) });
  if (!sequence) throw ApiError.notFound('Sequence not found');
  return sequence;
}

async function getOrderedSteps(sequenceId: string) {
  return db.query.sequenceSteps.findMany({ where: eq(sequenceSteps.sequenceId, sequenceId), orderBy: asc(sequenceSteps.stepOrder), columns: stepColumns });
}

async function activeEnrollmentCounts(sequenceIds: string[]): Promise<Map<string, number>> {
  if (sequenceIds.length === 0) return new Map();
  const rows = await db
    .select({ sequenceId: sequenceEnrollments.sequenceId, value: count() })
    .from(sequenceEnrollments)
    .where(and(inArray(sequenceEnrollments.sequenceId, sequenceIds), inArray(sequenceEnrollments.status, ['ACTIVE', 'PAUSED'])))
    .groupBy(sequenceEnrollments.sequenceId);
  return new Map(rows.map((r) => [r.sequenceId, Number(r.value)]));
}

export async function listSequences(org: string, query: { page: number; pageSize: number; search?: string; status?: string; sortDir: 'asc' | 'desc' }) {
  const conditions: SQL[] = [eq(sequences.organizationId, org)];
  if (query.search) conditions.push(ilike(sequences.name, `%${query.search}%`));
  if (query.status) conditions.push(eq(sequences.status, query.status as any));
  const where = and(...conditions);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.sequences.findMany({
      where,
      orderBy: (s, { asc: ascCol, desc: descCol }) => (query.sortDir === 'asc' ? ascCol(s.updatedAt) : descCol(s.updatedAt)),
      with: { createdBy: { columns: { id: true, firstName: true, lastName: true } } },
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(sequences).where(where),
  ]);

  const stepCounts = rows.length
    ? new Map(
        (
          await db
            .select({ sequenceId: sequenceSteps.sequenceId, value: count() })
            .from(sequenceSteps)
            .where(inArray(sequenceSteps.sequenceId, rows.map((r) => r.id)))
            .groupBy(sequenceSteps.sequenceId)
        ).map((r) => [r.sequenceId, Number(r.value)])
      )
    : new Map();
  const enrollmentCounts = await activeEnrollmentCounts(rows.map((r) => r.id));

  const data = rows.map((r) => ({ ...r, stepCount: stepCounts.get(r.id) ?? 0, activeEnrollmentCount: enrollmentCounts.get(r.id) ?? 0 }));
  return { data, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getSequenceById(org: string, id: string) {
  const sequence = await getOwnedSequence(org, id);
  const steps = await getOrderedSteps(id);
  const [activeCounts] = await Promise.all([activeEnrollmentCounts([id])]);
  return { ...sequence, steps, activeEnrollmentCount: activeCounts.get(id) ?? 0 };
}

export async function createSequence(req: Request, input: { name: string; description?: string | null }) {
  const org = orgId(req);
  const [created] = await db
    .insert(sequences)
    .values({ organizationId: org, name: input.name, description: input.description ?? null, createdById: req.user!.sub })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'Sequence', entityId: created.id, newValues: created });
  return getSequenceById(org, created.id);
}

export async function updateSequence(req: Request, id: string, input: { name?: string; description?: string | null; status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' }) {
  const org = orgId(req);
  const before = await getOwnedSequence(org, id);

  if (input.status && input.status !== before.status) {
    if (input.status === 'ACTIVE') {
      const steps = await getOrderedSteps(id);
      if (steps.length === 0) throw ApiError.badRequest('A sequence needs at least one step before it can be activated');
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;

  const [updated] = await db.update(sequences).set(data).where(eq(sequences.id, id)).returning();

  // Archiving exits every non-terminal enrollment — an explicit, visible outcome rather than
  // leaving them ACTIVE/PAUSED against a sequence that will never advance them again (see this
  // module's own top comment).
  if (input.status === 'ARCHIVED' && before.status !== 'ARCHIVED') {
    await db
      .update(sequenceEnrollments)
      .set({ status: 'EXITED', exitedAt: new Date(), nextSendAt: null, updatedAt: new Date() })
      .where(and(eq(sequenceEnrollments.sequenceId, id), inArray(sequenceEnrollments.status, ['ACTIVE', 'PAUSED'])));
  }

  await recordAudit({
    req,
    action: input.status && input.status !== before.status ? 'STATUS_CHANGED' : 'UPDATE',
    entityType: 'Sequence',
    entityId: id,
    oldValues: before,
    newValues: updated,
  });
  return getSequenceById(org, id);
}

export async function deleteSequence(req: Request, id: string) {
  const org = orgId(req);
  const before = await getOwnedSequence(org, id);
  const [{ value: enrollmentCount }] = await db.select({ value: count() }).from(sequenceEnrollments).where(eq(sequenceEnrollments.sequenceId, id));
  if (Number(enrollmentCount) > 0) {
    throw ApiError.conflict('This sequence has enrollment history and cannot be deleted — archive it instead');
  }
  await db.delete(sequences).where(eq(sequences.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Sequence', entityId: id, oldValues: before });
}

// ----------------------------------------------------------------------------
// Steps
// ----------------------------------------------------------------------------

export async function createStep(req: Request, sequenceId: string, input: { subject: string; body: string; delayDays: number }) {
  const org = orgId(req);
  await getOwnedSequence(org, sequenceId);
  const steps = await getOrderedSteps(sequenceId);
  const nextOrder = steps.length ? steps[steps.length - 1].stepOrder + 1 : 1;
  const [created] = await db
    .insert(sequenceSteps)
    .values({ sequenceId, organizationId: org, stepOrder: nextOrder, delayDays: input.delayDays, subject: input.subject, body: input.body })
    .returning({ id: sequenceSteps.id });
  await recordAudit({ req, action: 'CREATE', entityType: 'SequenceStep', entityId: created.id });
  return getSequenceById(org, sequenceId);
}

async function getOwnedStep(org: string, sequenceId: string, stepId: string) {
  const step = await db.query.sequenceSteps.findFirst({ where: and(eq(sequenceSteps.organizationId, org), eq(sequenceSteps.sequenceId, sequenceId), eq(sequenceSteps.id, stepId)) });
  if (!step) throw ApiError.notFound('Step not found');
  return step;
}

export async function updateStep(req: Request, sequenceId: string, stepId: string, input: { subject?: string; body?: string; delayDays?: number }) {
  const org = orgId(req);
  await getOwnedSequence(org, sequenceId);
  const before = await getOwnedStep(org, sequenceId, stepId);
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.body !== undefined) data.body = input.body;
  if (input.delayDays !== undefined) data.delayDays = input.delayDays;
  await db.update(sequenceSteps).set(data).where(eq(sequenceSteps.id, stepId));
  await recordAudit({ req, action: 'UPDATE', entityType: 'SequenceStep', entityId: stepId, oldValues: before });
  return getSequenceById(org, sequenceId);
}

export async function deleteStep(req: Request, sequenceId: string, stepId: string) {
  const org = orgId(req);
  await getOwnedSequence(org, sequenceId);
  const before = await getOwnedStep(org, sequenceId, stepId);

  const inFlight = await db.query.sequenceEnrollments.findFirst({
    where: and(eq(sequenceEnrollments.currentStepId, stepId), inArray(sequenceEnrollments.status, ['ACTIVE', 'PAUSED'])),
  });
  if (inFlight) {
    throw ApiError.conflict('One or more leads are currently on this step — pause or exit those enrollments first, or delete a step nothing is currently on');
  }

  await db.delete(sequenceSteps).where(eq(sequenceSteps.id, stepId));
  await recordAudit({ req, action: 'DELETE', entityType: 'SequenceStep', entityId: stepId, oldValues: before });
  return getSequenceById(org, sequenceId);
}

export async function moveStep(req: Request, sequenceId: string, stepId: string, direction: 'up' | 'down') {
  const org = orgId(req);
  await getOwnedSequence(org, sequenceId);
  const steps = await getOrderedSteps(sequenceId);
  const index = steps.findIndex((s) => s.id === stepId);
  if (index === -1) throw ApiError.notFound('Step not found');

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= steps.length) {
    // Already at the top/bottom — a no-op, not an error, so a client doesn't need to special-case
    // disabling the button at the exact edge.
    return getSequenceById(org, sequenceId);
  }

  const current = steps[index];
  const neighbor = steps[neighborIndex];
  await db.transaction(async (tx) => {
    // A direct two-statement swap would momentarily give `current` the same (sequenceId,
    // stepOrder) that `neighbor` still holds, which trips the sequence_steps_sequence_order_idx
    // UNIQUE INDEX immediately (Postgres checks a plain, non-DEFERRABLE unique index after each
    // statement, not at commit) — 23505, surfaced as a 500. Routing through a sentinel value that
    // no real step ever holds (stepOrder is always >= 0) avoids the collision.
    await tx.update(sequenceSteps).set({ stepOrder: -1, updatedAt: new Date() }).where(eq(sequenceSteps.id, current.id));
    await tx.update(sequenceSteps).set({ stepOrder: current.stepOrder, updatedAt: new Date() }).where(eq(sequenceSteps.id, neighbor.id));
    await tx.update(sequenceSteps).set({ stepOrder: neighbor.stepOrder, updatedAt: new Date() }).where(eq(sequenceSteps.id, current.id));
  });
  await recordAudit({ req, action: 'UPDATE', entityType: 'SequenceStep', entityId: stepId });
  return getSequenceById(org, sequenceId);
}

// ----------------------------------------------------------------------------
// Enrollments
// ----------------------------------------------------------------------------

function serializeEnrollment(row: any) {
  return { ...row, lead: row.lead ? { ...row.lead, displayId: formatLeadNumber(row.lead.leadNumber) } : null };
}

export async function listEnrollments(org: string, sequenceId: string, query: { page: number; pageSize: number; status?: string }) {
  await getOwnedSequence(org, sequenceId);
  const conditions: SQL[] = [eq(sequenceEnrollments.organizationId, org), eq(sequenceEnrollments.sequenceId, sequenceId)];
  if (query.status) conditions.push(eq(sequenceEnrollments.status, query.status as any));
  const where = and(...conditions);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.sequenceEnrollments.findMany({
      where,
      orderBy: (e, { desc }) => desc(e.createdAt),
      with: {
        lead: { columns: { id: true, leadNumber: true }, with: { contact: { columns: { id: true, firstName: true, lastName: true, email: true } } } },
        enrolledBy: { columns: { id: true, firstName: true, lastName: true } },
        currentStep: { columns: { id: true, stepOrder: true, subject: true } },
      },
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(sequenceEnrollments).where(where),
  ]);

  return { data: rows.map(serializeEnrollment), meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function enrollLead(req: Request, sequenceId: string, leadId: string) {
  const org = orgId(req);
  const sequence = await getOwnedSequence(org, sequenceId);
  if (sequence.status !== 'ACTIVE') throw ApiError.badRequest('Only an ACTIVE sequence can accept new enrollments');

  const steps = await getOrderedSteps(sequenceId);
  if (steps.length === 0) throw ApiError.badRequest('This sequence has no steps');
  const firstStep = steps[0];

  const lead = await db.query.leads.findFirst({ where: and(eq(leads.organizationId, org), eq(leads.id, leadId)), with: { contact: { columns: { email: true } } } });
  if (!lead) throw ApiError.notFound('Lead not found');
  if (!lead.contact?.email) throw ApiError.badRequest('This lead has no contact email address — link a contact with an email before enrolling');

  const existing = await db.query.sequenceEnrollments.findFirst({
    where: and(eq(sequenceEnrollments.sequenceId, sequenceId), eq(sequenceEnrollments.leadId, leadId), inArray(sequenceEnrollments.status, ['ACTIVE', 'PAUSED'])),
  });
  if (existing) throw ApiError.conflict('This lead already has an active or paused enrollment in this sequence');

  const nextSendAt = computeNextSendAt(new Date(), firstStep.delayDays, env.SEQUENCE_SEND_WINDOW_START_HOUR, env.SEQUENCE_SEND_WINDOW_END_HOUR);
  const [created] = await db
    .insert(sequenceEnrollments)
    .values({ organizationId: org, sequenceId, leadId, enrolledById: req.user!.sub, currentStepId: firstStep.id, nextSendAt })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'SequenceEnrollment', entityId: created.id, newValues: created });
  return created;
}

async function getOwnedEnrollment(org: string, id: string) {
  const enrollment = await db.query.sequenceEnrollments.findFirst({ where: and(eq(sequenceEnrollments.organizationId, org), eq(sequenceEnrollments.id, id)) });
  if (!enrollment) throw ApiError.notFound('Enrollment not found');
  return enrollment;
}

export async function pauseEnrollment(req: Request, id: string) {
  const org = orgId(req);
  const before = await getOwnedEnrollment(org, id);
  if (before.status !== 'ACTIVE') throw ApiError.badRequest('Only an ACTIVE enrollment can be paused');
  const [updated] = await db
    .update(sequenceEnrollments)
    .set({ status: 'PAUSED', pausedAt: new Date(), nextSendAt: null, updatedAt: new Date() })
    .where(eq(sequenceEnrollments.id, id))
    .returning();
  await recordAudit({ req, action: 'STATUS_CHANGED', entityType: 'SequenceEnrollment', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function resumeEnrollment(req: Request, id: string) {
  const org = orgId(req);
  const before = await getOwnedEnrollment(org, id);
  if (before.status !== 'PAUSED') throw ApiError.badRequest('Only a PAUSED enrollment can be resumed');
  if (!before.currentStepId) throw ApiError.conflict('This enrollment has no pending step to resume onto — exit it and re-enroll instead');

  const step = await db.query.sequenceSteps.findFirst({ where: eq(sequenceSteps.id, before.currentStepId) });
  if (!step) throw ApiError.conflict('The step this enrollment was paused on no longer exists — exit it and re-enroll instead');

  // Resuming restarts the countdown for the pending step from NOW (a documented v1
  // simplification — see this module's top comment), not from wherever the original countdown
  // was interrupted.
  const nextSendAt = computeNextSendAt(new Date(), 0, env.SEQUENCE_SEND_WINDOW_START_HOUR, env.SEQUENCE_SEND_WINDOW_END_HOUR);
  const [updated] = await db
    .update(sequenceEnrollments)
    .set({ status: 'ACTIVE', pausedAt: null, nextSendAt, updatedAt: new Date() })
    .where(eq(sequenceEnrollments.id, id))
    .returning();
  await recordAudit({ req, action: 'STATUS_CHANGED', entityType: 'SequenceEnrollment', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function exitEnrollment(req: Request, id: string) {
  const org = orgId(req);
  const before = await getOwnedEnrollment(org, id);
  if (before.status === 'COMPLETED' || before.status === 'EXITED') {
    throw ApiError.badRequest('This enrollment has already ended');
  }
  const [updated] = await db
    .update(sequenceEnrollments)
    .set({ status: 'EXITED', exitedAt: new Date(), nextSendAt: null, updatedAt: new Date() })
    .where(eq(sequenceEnrollments.id, id))
    .returning();
  await recordAudit({ req, action: 'STATUS_CHANGED', entityType: 'SequenceEnrollment', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

// ----------------------------------------------------------------------------
// The engine — one scheduler tick. Exported directly (not just via sequenceScheduler.ts's
// setInterval wrapper) so tests can call it deterministically instead of waiting on real time.
// ----------------------------------------------------------------------------

async function countConsecutiveFailures(enrollmentId: string, stepId: string): Promise<number> {
  const rows = await db.query.sequenceSends.findMany({
    where: and(eq(sequenceSends.enrollmentId, enrollmentId), eq(sequenceSends.stepId, stepId)),
    orderBy: (s, { desc }) => desc(s.sentAt),
    limit: MAX_CONSECUTIVE_SEND_FAILURES,
  });
  let n = 0;
  for (const row of rows) {
    if (row.status !== 'FAILED') break;
    n += 1;
  }
  return n;
}

/** Processes every enrollment currently due. Never throws — a single enrollment's failure must
 * not abort the rest of the tick (each is logged and isolated). */
export async function runDueSequenceSteps(): Promise<{ processed: number }> {
  const now = new Date();
  const due = await db.query.sequenceEnrollments.findMany({
    where: and(eq(sequenceEnrollments.status, 'ACTIVE'), lte(sequenceEnrollments.nextSendAt, now)),
    with: {
      lead: { columns: { id: true }, with: { contact: { columns: { email: true } } } },
      currentStep: true,
    },
  });

  let processed = 0;
  for (const enrollment of due) {
    try {
      await processDueEnrollment(enrollment as any, now);
      processed += 1;
    } catch (err) {
      logger.error({ err, enrollmentId: enrollment.id }, '[sequences] Failed to process a due enrollment');
    }
  }
  return { processed };
}

async function processDueEnrollment(
  enrollment: typeof sequenceEnrollments.$inferSelect & { lead: { contact: { email: string | null } | null } | null; currentStep: typeof sequenceSteps.$inferSelect | null },
  now: Date
): Promise<void> {
  const step = enrollment.currentStep;
  if (!step) {
    // Dangling reference (the step was deleted out from under an ACTIVE enrollment — shouldn't
    // happen given deleteStep's guard, but this is the safety net for it). Nothing to send;
    // there's nothing meaningful left to advance to either, so end it visibly rather than
    // leaving it stuck silently re-querying as "due" forever.
    await db.update(sequenceEnrollments).set({ status: 'EXITED', exitedAt: now, nextSendAt: null, updatedAt: now }).where(eq(sequenceEnrollments.id, enrollment.id));
    return;
  }

  const recipientEmail = enrollment.lead?.contact?.email ?? null;
  let sendError: string | null = null;
  if (!recipientEmail) {
    sendError = 'Lead has no contact email address';
  } else {
    try {
      await sendEmailAsUser(enrollment.enrolledById, { to: recipientEmail, subject: step.subject, text: step.body });
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Unknown send error';
    }
  }

  await db.insert(sequenceSends).values({
    organizationId: enrollment.organizationId,
    enrollmentId: enrollment.id,
    stepId: step.id,
    status: sendError ? 'FAILED' : 'SENT',
    errorMessage: sendError,
    sentAt: now,
  });

  if (sendError) {
    // The sequenceSends row for THIS failure was already inserted just above, so this count
    // already includes it — no "+1" needed.
    const consecutiveFailures = await countConsecutiveFailures(enrollment.id, step.id);
    if (shouldAutoPause(consecutiveFailures)) {
      await db
        .update(sequenceEnrollments)
        .set({ status: 'PAUSED', pausedAt: now, nextSendAt: null, updatedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      logger.warn({ enrollmentId: enrollment.id, stepId: step.id }, '[sequences] Auto-paused an enrollment after repeated send failures');
    } else {
      // Retry on the next tick rather than the full step delay — a short, fixed backoff, not
      // exponential (v1 keeps this simple; see this module's top comment on scope).
      const retryAt = new Date(now.getTime() + env.SEQUENCE_SCHEDULER_INTERVAL_MINUTES * 60_000);
      await db.update(sequenceEnrollments).set({ nextSendAt: retryAt, updatedAt: now }).where(eq(sequenceEnrollments.id, enrollment.id));
    }
    return;
  }

  const nextStep = await db.query.sequenceSteps.findFirst({
    where: and(eq(sequenceSteps.sequenceId, enrollment.sequenceId), gt(sequenceSteps.stepOrder, step.stepOrder)),
    orderBy: asc(sequenceSteps.stepOrder),
  });

  if (nextStep) {
    const nextSendAt = computeNextSendAt(now, nextStep.delayDays, env.SEQUENCE_SEND_WINDOW_START_HOUR, env.SEQUENCE_SEND_WINDOW_END_HOUR);
    await db
      .update(sequenceEnrollments)
      .set({ currentStepId: nextStep.id, nextSendAt, updatedAt: now })
      .where(eq(sequenceEnrollments.id, enrollment.id));
  } else {
    await db
      .update(sequenceEnrollments)
      .set({ status: 'COMPLETED', completedAt: now, currentStepId: null, nextSendAt: null, updatedAt: now })
      .where(eq(sequenceEnrollments.id, enrollment.id));
  }
}
