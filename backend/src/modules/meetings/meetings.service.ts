import { Request } from 'express';
import { and, asc, eq, gte, lte, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { meetings, leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { recordActivity } from '@/utils/activityLogger';
import { orgId } from '@/utils/tenant';
import { syncMeetingCreated, syncMeetingUpdated, syncMeetingDeleted, type CalendarSyncOutcome } from '@/utils/calendarSync';
import type { OAuthProvider } from '@/modules/integrations/integrations.service';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3 (calendar sync,
// see utils/calendarSync.ts for the full design). Only the fields below can change what's on the
// calendar; touching anything else (mom, outcome, a non-CANCELLED status change) skips calendar
// work entirely rather than re-syncing on every edit.
const CALENDAR_RELEVANT_FIELDS = ['title', 'scheduledAt', 'durationMins', 'location', 'attendees'] as const;

function calendarSyncFields(outcome: CalendarSyncOutcome) {
  if (outcome.status === 'SYNCED') {
    return { externalCalendarProvider: outcome.provider, externalEventId: outcome.externalEventId, calendarSyncStatus: 'SYNCED' as const, calendarSyncError: null };
  }
  if (outcome.status === 'FAILED') {
    // Deliberately leaves externalCalendarProvider/externalEventId untouched — on an update
    // failure, whatever event previously existed out there is still there; only our patch failed.
    return { calendarSyncStatus: 'FAILED' as const, calendarSyncError: outcome.error };
  }
  return { externalCalendarProvider: null, externalEventId: null, calendarSyncStatus: 'NOT_CONNECTED' as const, calendarSyncError: null };
}

function existingEventRef(m: typeof meetings.$inferSelect): { provider: OAuthProvider; externalEventId: string } | null {
  return m.externalEventId && m.externalCalendarProvider ? { provider: m.externalCalendarProvider as OAuthProvider, externalEventId: m.externalEventId } : null;
}

async function leadContactEmail(leadId: string): Promise<string | null> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId), with: { contact: { columns: { email: true } } } });
  return lead?.contact?.email ?? null;
}

export async function listMeetings(org: string, query: { leadId?: string; upcoming?: boolean; from?: Date; to?: Date }) {
  const conditions: SQL[] = [eq(meetings.organizationId, org)];
  if (query.leadId) conditions.push(eq(meetings.leadId, query.leadId));
  if (query.upcoming) {
    conditions.push(gte(meetings.scheduledAt, new Date()));
    conditions.push(eq(meetings.status, 'SCHEDULED'));
  }
  if (query.from) conditions.push(gte(meetings.scheduledAt, query.from));
  if (query.to) conditions.push(lte(meetings.scheduledAt, query.to));

  return db.query.meetings.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: asc(meetings.scheduledAt),
    with: { lead: { columns: { id: true, leadNumber: true }, with: { company: { columns: { name: true } } } } },
  });
}

export async function createMeeting(req: Request, input: any) {
  const org = orgId(req);
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.organizationId, org), eq(leads.id, input.leadId)),
    with: { contact: { columns: { email: true } } },
  });
  if (!lead) throw ApiError.notFound('Lead not found');

  const [inserted] = await db.insert(meetings).values({ ...input, organizationId: org, createdById: req.user!.sub }).returning();

  const outcome = await syncMeetingCreated(inserted.createdById, {
    title: inserted.title,
    scheduledAt: inserted.scheduledAt,
    durationMins: inserted.durationMins,
    location: inserted.location,
    attendees: inserted.attendees,
    leadContactEmail: lead.contact?.email ?? null,
  });
  const [meeting] = await db.update(meetings).set(calendarSyncFields(outcome)).where(eq(meetings.id, inserted.id)).returning();

  if (['NEW', 'CONTACTED', 'QUALIFIED'].includes(lead.status)) {
    await db.update(leads).set({ status: 'MEETING_SCHEDULED', updatedAt: new Date() }).where(eq(leads.id, lead.id));
  }

  await recordActivity({
    organizationId: org,
    type: 'MEETING_SCHEDULED',
    description: `Meeting "${meeting.title}" scheduled for ${meeting.scheduledAt.toDateString()}`,
    leadId: lead.id,
    userId: req.user!.sub,
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'Meeting', entityId: meeting.id, newValues: meeting });

  return meeting;
}

export async function updateMeeting(req: Request, id: string, input: any) {
  const org = orgId(req);
  const before = await db.query.meetings.findFirst({ where: and(eq(meetings.organizationId, org), eq(meetings.id, id)) });
  if (!before) throw ApiError.notFound('Meeting not found');

  let meeting = (await db.update(meetings).set({ ...input, updatedAt: new Date() }).where(eq(meetings.id, id)).returning())[0];

  const cancellingNow = input.status === 'CANCELLED' && before.status !== 'CANCELLED';
  const calendarFieldsTouched = CALENDAR_RELEVANT_FIELDS.some((f) => input[f] !== undefined);

  if (cancellingNow) {
    await syncMeetingDeleted(before.createdById, existingEventRef(before));
    meeting = (await db.update(meetings).set(calendarSyncFields({ status: 'NOT_CONNECTED' })).where(eq(meetings.id, id)).returning())[0];
  } else if (calendarFieldsTouched) {
    const outcome = await syncMeetingUpdated(before.createdById, existingEventRef(before), {
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      durationMins: meeting.durationMins,
      location: meeting.location,
      attendees: meeting.attendees,
      leadContactEmail: await leadContactEmail(meeting.leadId),
    });
    meeting = (await db.update(meetings).set(calendarSyncFields(outcome)).where(eq(meetings.id, id)).returning())[0];
  }

  if (input.status === 'COMPLETED' && before.status !== 'COMPLETED') {
    await recordActivity({
      organizationId: org,
      type: 'MEETING_COMPLETED',
      description: `Meeting "${meeting.title}" completed${meeting.mom ? ' with MoM recorded' : ''}`,
      leadId: meeting.leadId,
      userId: req.user!.sub,
    });
  } else if (input.mom && input.mom !== before.mom) {
    await recordActivity({ organizationId: org, type: 'MOM_ADDED', description: `MoM added for "${meeting.title}"`, leadId: meeting.leadId, userId: req.user!.sub });
  } else {
    await recordActivity({ organizationId: org, type: 'MEETING_UPDATED', description: `Meeting "${meeting.title}" updated`, leadId: meeting.leadId, userId: req.user!.sub });
  }

  await recordAudit({ req, action: 'UPDATE', entityType: 'Meeting', entityId: id, oldValues: before, newValues: meeting });
  return meeting;
}

export async function deleteMeeting(req: Request, id: string) {
  const org = orgId(req);
  const before = await db.query.meetings.findFirst({ where: and(eq(meetings.organizationId, org), eq(meetings.id, id)) });
  if (!before) throw ApiError.notFound('Meeting not found');
  // Best-effort — deleting the CRM record always succeeds regardless of the calendar side.
  await syncMeetingDeleted(before.createdById, existingEventRef(before));
  await db.delete(meetings).where(eq(meetings.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Meeting', entityId: id, oldValues: before });
}
