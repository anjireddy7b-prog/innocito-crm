import { Request } from 'express';
import { and, asc, eq, gte, lte, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { meetings, leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { recordActivity } from '@/utils/activityLogger';

export async function listMeetings(query: { leadId?: string; upcoming?: boolean; from?: Date; to?: Date }) {
  const conditions: SQL[] = [];
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
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
  if (!lead) throw ApiError.notFound('Lead not found');

  const [meeting] = await db.insert(meetings).values({ ...input, createdById: req.user!.sub }).returning();

  if (['NEW', 'CONTACTED', 'QUALIFIED'].includes(lead.status)) {
    await db.update(leads).set({ status: 'MEETING_SCHEDULED', updatedAt: new Date() }).where(eq(leads.id, lead.id));
  }

  await recordActivity({
    type: 'MEETING_SCHEDULED',
    description: `Meeting "${meeting.title}" scheduled for ${meeting.scheduledAt.toDateString()}`,
    leadId: lead.id,
    userId: req.user!.sub,
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'Meeting', entityId: meeting.id, newValues: meeting });

  return meeting;
}

export async function updateMeeting(req: Request, id: string, input: any) {
  const before = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!before) throw ApiError.notFound('Meeting not found');

  const [meeting] = await db.update(meetings).set({ ...input, updatedAt: new Date() }).where(eq(meetings.id, id)).returning();

  if (input.status === 'COMPLETED' && before.status !== 'COMPLETED') {
    await recordActivity({
      type: 'MEETING_COMPLETED',
      description: `Meeting "${meeting.title}" completed${meeting.mom ? ' with MoM recorded' : ''}`,
      leadId: meeting.leadId,
      userId: req.user!.sub,
    });
  } else if (input.mom && input.mom !== before.mom) {
    await recordActivity({ type: 'MOM_ADDED', description: `MoM added for "${meeting.title}"`, leadId: meeting.leadId, userId: req.user!.sub });
  } else {
    await recordActivity({ type: 'MEETING_UPDATED', description: `Meeting "${meeting.title}" updated`, leadId: meeting.leadId, userId: req.user!.sub });
  }

  await recordAudit({ req, action: 'UPDATE', entityType: 'Meeting', entityId: id, oldValues: before, newValues: meeting });
  return meeting;
}

export async function deleteMeeting(req: Request, id: string) {
  const before = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!before) throw ApiError.notFound('Meeting not found');
  await db.delete(meetings).where(eq(meetings.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Meeting', entityId: id, oldValues: before });
}
