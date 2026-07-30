import { Request } from 'express';
import { and, asc, desc, eq, ilike, inArray, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { leads, companies, contacts, campaigns, meetings, tasks, documents, comments } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { recordActivity } from '@/utils/activityLogger';
import { notifyUser } from '@/utils/notifier';
import { paginationMeta, toSkipTake } from '@/utils/pagination';
import { formatLeadNumber, parseLeadNumber } from '@/utils/leadNumber';
import { cache } from '@/config/redis';
import { PERMISSIONS } from '@/utils/permissions';

const leadWith = {
  company: { columns: { id: true, name: true, domain: true, industry: true, country: true } },
  contact: { columns: { id: true, firstName: true, lastName: true, email: true, phone: true, designation: true } },
  campaign: { columns: { id: true, name: true, code: true } },
  assignedTo: { columns: { id: true, firstName: true, lastName: true, email: true } },
  currentOwner: { columns: { id: true, firstName: true, lastName: true, email: true } },
  createdBy: { columns: { id: true, firstName: true, lastName: true } },
} as const;

function serializeLead(lead: any) {
  return { ...lead, displayId: formatLeadNumber(lead.leadNumber) };
}

async function withCounts(lead: any) {
  const [[{ value: m }], [{ value: t }], [{ value: d }], [{ value: c }]] = await Promise.all([
    db.select({ value: count() }).from(meetings).where(eq(meetings.leadId, lead.id)),
    db.select({ value: count() }).from(tasks).where(eq(tasks.leadId, lead.id)),
    db.select({ value: count() }).from(documents).where(eq(documents.leadId, lead.id)),
    db.select({ value: count() }).from(comments).where(eq(comments.leadId, lead.id)),
  ]);
  return { ...lead, _count: { meetings: Number(m), tasks: Number(t), documents: Number(d), leadComments: Number(c) } };
}

function canEditLead(req: Request, lead: { assignedToId: string | null; currentOwnerId: string | null; createdById: string | null }) {
  const perms = req.user!.permissions;
  if (perms.includes(PERMISSIONS.LEADS_EDIT_ANY)) return true;
  if (!perms.includes(PERMISSIONS.LEADS_EDIT_OWN)) return false;
  const uid = req.user!.sub;
  return lead.assignedToId === uid || lead.currentOwnerId === uid || lead.createdById === uid;
}

export async function listLeads(query: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  source?: string;
  priority?: string;
  campaignId?: string;
  assignedToId?: string;
  currentOwnerId?: string;
  companyId?: string;
  country?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [eq(leads.isActive, true)];

  if (query.search) {
    const asNumber = parseLeadNumber(query.search);
    const term = `%${query.search}%`;
    conditions.push(
      or(
        ...(asNumber !== null ? [eq(leads.leadNumber, asNumber)] : []),
        ilike(companies.name, term),
        ilike(companies.domain, term),
        ilike(contacts.firstName, term),
        ilike(contacts.lastName, term),
        ilike(contacts.email, term),
        ilike(contacts.phone, term),
        ilike(campaigns.name, term)
      )!
    );
  }
  if (query.status) conditions.push(inArray(leads.status, query.status.split(',') as any));
  if (query.source) conditions.push(inArray(leads.source, query.source.split(',') as any));
  if (query.priority) conditions.push(inArray(leads.priority, query.priority.split(',') as any));
  if (query.campaignId) conditions.push(eq(leads.campaignId, query.campaignId));
  if (query.assignedToId) conditions.push(eq(leads.assignedToId, query.assignedToId));
  if (query.currentOwnerId) conditions.push(eq(leads.currentOwnerId, query.currentOwnerId));
  if (query.companyId) conditions.push(eq(leads.companyId, query.companyId));
  if (query.country) conditions.push(eq(companies.country, query.country));

  const where = and(...conditions);

  const sortable: Record<string, any> = {
    createdAt: leads.createdAt,
    updatedAt: leads.updatedAt,
    status: leads.status,
    priority: leads.priority,
    dealValue: leads.dealValue,
    expectedCloseDate: leads.expectedCloseDate,
    leadNumber: leads.leadNumber,
  };
  const orderCol = sortable[query.sortBy ?? ''] ?? leads.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const baseQuery = db
    .select({ id: leads.id })
    .from(leads)
    .leftJoin(companies, eq(leads.companyId, companies.id))
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(where)
    .orderBy(orderBy)
    .$dynamic();

  const [idRows, [{ value: total }]] = await Promise.all([
    baseQuery.limit(query.pageSize).offset(toSkipTake(query.page, query.pageSize).skip),
    db
      .select({ value: count() })
      .from(leads)
      .leftJoin(companies, eq(leads.companyId, companies.id))
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(where),
  ]);

  const ids = idRows.map((r) => r.id);
  const rows = ids.length
    ? await db.query.leads.findMany({ where: inArray(leads.id, ids), with: leadWith })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const withCountsRows = await Promise.all(ordered.map(withCounts));

  return { data: withCountsRows.map(serializeLead), meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getLeadById(id: string) {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: {
      ...leadWith,
      meetings: { orderBy: (m, { desc }) => desc(m.scheduledAt) },
      tasks: { orderBy: (t, { asc }) => asc(t.dueDate), with: { assignedTo: { columns: { id: true, firstName: true, lastName: true } } } },
      documents: { orderBy: (d, { desc }) => desc(d.createdAt), with: { uploadedBy: { columns: { id: true, firstName: true, lastName: true } } } },
      leadComments: { orderBy: (c, { desc }) => desc(c.createdAt), with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      activities: { orderBy: (a, { desc }) => desc(a.createdAt), limit: 100, with: { user: { columns: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!lead) throw ApiError.notFound('Lead not found');
  const withC = await withCounts(lead);
  return serializeLead(withC);
}

async function resolveCompanyAndContact(req: Request, input: any) {
  let companyId: string | null = input.companyId ?? null;
  if (!companyId && input.companyName) {
    const existing = await db.query.companies.findFirst({ where: ilike(companies.name, input.companyName) });
    if (existing) {
      companyId = existing.id;
    } else {
      const [created] = await db.insert(companies).values({ name: input.companyName, createdById: req.user!.sub }).returning();
      companyId = created.id;
    }
  }

  let contactId: string | null = input.contactId ?? null;
  if (!contactId && input.contact) {
    const [created] = await db
      .insert(contacts)
      .values({ ...input.contact, email: input.contact.email || null, companyId, createdById: req.user!.sub })
      .returning();
    contactId = created.id;
  }

  return { companyId, contactId };
}

export async function createLead(req: Request, input: any) {
  const { companyId, contactId } = await resolveCompanyAndContact(req, input);

  const [created] = await db
    .insert(leads)
    .values({
      companyId,
      contactId,
      campaignId: input.campaignId ?? null,
      source: input.source,
      status: input.status,
      priority: input.priority,
      category: input.category,
      dealValue: input.dealValue?.toString(),
      currency: input.currency ?? 'USD',
      probability: input.probability,
      expectedCloseDate: input.expectedCloseDate,
      tags: input.tags ?? [],
      assignedToId: input.assignedToId,
      currentOwnerId: input.currentOwnerId,
      meetingDetails: input.meetingDetails,
      comments: input.comments,
      mom: input.mom,
      nextSteps: input.nextSteps,
      createdById: req.user!.sub,
    })
    .returning();

  const lead = await getLeadById(created.id);

  await recordActivity({
    type: 'LEAD_CREATED',
    description: `Lead ${formatLeadNumber(created.leadNumber)} created`,
    leadId: created.id,
    userId: req.user!.sub,
  });
  if (created.assignedToId) {
    await notifyUser({
      userId: created.assignedToId,
      type: 'LEAD_ASSIGNED',
      title: 'New lead assigned',
      message: `You were assigned lead ${formatLeadNumber(created.leadNumber)}${lead.company ? ` for ${(lead as any).company.name}` : ''}.`,
      leadId: created.id,
    });
  }
  await recordAudit({ req, action: 'CREATE', entityType: 'Lead', entityId: created.id, newValues: created });
  await cache.del('dashboard:*');

  return lead;
}

export async function updateLead(req: Request, id: string, input: any) {
  const before = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!before) throw ApiError.notFound('Lead not found');
  if (!canEditLead(req, before)) throw ApiError.forbidden('You do not have permission to edit this lead');

  const needsResolve = input.companyId || input.companyName || input.contactId || input.contact;
  const { companyId, contactId } = needsResolve
    ? await resolveCompanyAndContact(req, input)
    : { companyId: undefined, contactId: undefined };

  await db
    .update(leads)
    .set({
      ...(companyId !== undefined ? { companyId } : {}),
      ...(contactId !== undefined ? { contactId } : {}),
      ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}),
      source: input.source,
      priority: input.priority,
      category: input.category,
      dealValue: input.dealValue !== undefined ? input.dealValue?.toString() : undefined,
      currency: input.currency,
      probability: input.probability,
      expectedCloseDate: input.expectedCloseDate,
      actualCloseDate: input.actualCloseDate,
      lossReason: input.lossReason,
      tags: input.tags,
      meetingDetails: input.meetingDetails,
      comments: input.comments,
      mom: input.mom,
      nextSteps: input.nextSteps,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  const lead = await getLeadById(id);

  await recordActivity({
    type: 'LEAD_UPDATED',
    description: `Lead ${formatLeadNumber(before.leadNumber)} details updated`,
    leadId: id,
    userId: req.user!.sub,
  });
  await recordAudit({ req, action: 'UPDATE', entityType: 'Lead', entityId: id, oldValues: before, newValues: lead });
  await cache.del('dashboard:*');

  return lead;
}

export async function assignLead(req: Request, id: string, input: { assignedToId?: string | null; currentOwnerId?: string | null; note?: string }) {
  const before = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!before) throw ApiError.notFound('Lead not found');

  await db
    .update(leads)
    .set({
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      ...(input.currentOwnerId !== undefined ? { currentOwnerId: input.currentOwnerId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  const lead = await getLeadById(id);

  const changedOwner = input.currentOwnerId !== undefined && input.currentOwnerId !== before.currentOwnerId;
  const changedAssignee = input.assignedToId !== undefined && input.assignedToId !== before.assignedToId;

  await recordActivity({
    type: before.assignedToId || before.currentOwnerId ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED',
    description: `Lead ${formatLeadNumber(before.leadNumber)} reassigned${input.note ? `: ${input.note}` : ''}`,
    leadId: id,
    userId: req.user!.sub,
    metadata: { assignedToId: input.assignedToId, currentOwnerId: input.currentOwnerId },
  });

  if (changedAssignee && input.assignedToId) {
    await notifyUser({
      userId: input.assignedToId,
      type: 'LEAD_ASSIGNED',
      title: 'Lead assigned to you',
      message: `Lead ${formatLeadNumber(before.leadNumber)} was assigned to you.`,
      leadId: id,
    });
  }
  if (changedOwner && input.currentOwnerId) {
    await notifyUser({
      userId: input.currentOwnerId,
      type: 'LEAD_ASSIGNED',
      title: 'Lead ownership transferred to you',
      message: `Lead ${formatLeadNumber(before.leadNumber)} ownership was transferred to you.`,
      leadId: id,
    });
  }

  await recordAudit({
    req,
    action: 'ASSIGNMENT_CHANGED',
    entityType: 'Lead',
    entityId: id,
    oldValues: { assignedToId: before.assignedToId, currentOwnerId: before.currentOwnerId },
    newValues: { assignedToId: input.assignedToId, currentOwnerId: input.currentOwnerId },
  });
  await cache.del('dashboard:*');

  return lead;
}

export async function bulkAssignLeads(req: Request, input: { leadIds: string[]; assignedToId?: string | null; currentOwnerId?: string | null }) {
  await db
    .update(leads)
    .set({
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      ...(input.currentOwnerId !== undefined ? { currentOwnerId: input.currentOwnerId } : {}),
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, input.leadIds));

  await Promise.all(
    input.leadIds.map((leadId) =>
      recordActivity({ type: 'LEAD_REASSIGNED', description: 'Bulk assignment update', leadId, userId: req.user!.sub })
    )
  );
  await recordAudit({ req, action: 'ASSIGNMENT_CHANGED', entityType: 'Lead', newValues: input });
  await cache.del('dashboard:*');
  return { updated: input.leadIds.length };
}

// Previously the lead pipeline enforced a strict stage order (e.g. you could
// not jump from DEMO_DONE straight to WON without passing through
// PROPOSAL_SENT / NEGOTIATION first). Per product decision, reps need to be
// able to set a lead to any status at any time — a deal can close faster
// than the paperwork stages suggest, or a rep may need to correct a
// mis-set status — so that restriction has been removed. The status value
// itself is still validated against the fixed enum of real statuses by the
// route's zod schema (`changeStatusSchema`), so this only lifts the
// "which stage can follow which stage" ordering rule, not the set of valid
// statuses.
export async function changeLeadStatus(req: Request, id: string, input: { status: string; lossReason?: string | null; note?: string }) {
  const before = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!before) throw ApiError.notFound('Lead not found');
  if (!canEditLead(req, before)) throw ApiError.forbidden('You do not have permission to edit this lead');

  const isTerminal = ['WON', 'LOST', 'DISQUALIFIED'].includes(input.status);
  await db
    .update(leads)
    .set({
      status: input.status as any,
      lossReason: input.status === 'LOST' ? input.lossReason : undefined,
      actualCloseDate: isTerminal ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  const lead = await getLeadById(id);

  await recordActivity({
    type: 'STATUS_CHANGED',
    description: `Status changed from ${before.status} to ${input.status}${input.note ? `: ${input.note}` : ''}`,
    leadId: id,
    userId: req.user!.sub,
    metadata: { from: before.status, to: input.status },
  });

  const notifyTarget = before.currentOwnerId ?? before.assignedToId;
  if (notifyTarget && notifyTarget !== req.user!.sub) {
    await notifyUser({
      userId: notifyTarget,
      type: 'STATUS_CHANGED',
      title: 'Lead status updated',
      message: `Lead ${formatLeadNumber(before.leadNumber)} moved to ${input.status.replace(/_/g, ' ')}.`,
      leadId: id,
    });
  }

  await recordAudit({
    req,
    action: 'STATUS_CHANGED',
    entityType: 'Lead',
    entityId: id,
    oldValues: { status: before.status },
    newValues: { status: input.status },
  });
  await cache.del('dashboard:*');

  return lead;
}

export async function deleteLead(req: Request, id: string) {
  const before = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!before) throw ApiError.notFound('Lead not found');
  await db.update(leads).set({ isActive: false, updatedAt: new Date() }).where(eq(leads.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Lead', entityId: id, oldValues: before });
  await cache.del('dashboard:*');
}
