import { Request } from 'express';
import { and, asc, desc, eq, ilike, inArray, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { cases, caseComments } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { orgId } from '@/utils/tenant';

/** "CS-000001" — same zero-padded, prefixed display format as leads' formatLeadNumber(), kept as
 * a private one-liner here rather than its own utils file since (unlike leadNumber.ts) nothing else
 * needs to parse a case number back out of user input yet. */
function formatCaseNumber(seq: number): string {
  return `CS-${String(seq).padStart(6, '0')}`;
}

const CASE_RELATIONS = {
  company: { columns: { id: true, name: true, domain: true } },
  contact: { columns: { id: true, firstName: true, lastName: true, email: true } },
  assignedTo: { columns: { id: true, firstName: true, lastName: true } },
  createdBy: { columns: { id: true, firstName: true, lastName: true } },
} as const;

function withDisplayId<T extends { caseNumber: number }>(c: T) {
  return { ...c, displayId: formatCaseNumber(c.caseNumber) };
}

export async function listCases(org: string, query: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  companyId?: string;
  contactId?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [eq(cases.organizationId, org)];
  if (query.search) {
    conditions.push(or(ilike(cases.subject, `%${query.search}%`), ilike(cases.description, `%${query.search}%`))!);
  }
  if (query.status) conditions.push(inArray(cases.status, query.status.split(',') as any));
  if (query.priority) conditions.push(inArray(cases.priority, query.priority.split(',') as any));
  if (query.assignedToId) conditions.push(eq(cases.assignedToId, query.assignedToId));
  if (query.companyId) conditions.push(eq(cases.companyId, query.companyId));
  if (query.contactId) conditions.push(eq(cases.contactId, query.contactId));
  const where = and(...conditions);

  const sortable: Record<string, any> = {
    createdAt: cases.createdAt,
    updatedAt: cases.updatedAt,
    subject: cases.subject,
    status: cases.status,
    priority: cases.priority,
    caseNumber: cases.caseNumber,
  };
  const orderCol = sortable[query.sortBy ?? ''] ?? cases.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.cases.findMany({ where, orderBy, with: CASE_RELATIONS, ...toLimitOffset(query.page, query.pageSize) }),
    db.select({ value: count() }).from(cases).where(where),
  ]);

  return { data: rows.map(withDisplayId), meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getCaseById(org: string, id: string) {
  const found = await db.query.cases.findFirst({
    where: and(eq(cases.organizationId, org), eq(cases.id, id)),
    with: {
      ...CASE_RELATIONS,
      comments: { orderBy: desc(caseComments.createdAt), with: { user: { columns: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!found) throw ApiError.notFound('Case not found');
  return withDisplayId(found);
}

export async function createCase(req: Request, input: any) {
  const org = orgId(req);
  const [created] = await db
    .insert(cases)
    .values({
      subject: input.subject,
      description: input.description ?? null,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      priority: input.priority ?? 'MEDIUM',
      assignedToId: input.assignedToId ?? null,
      organizationId: org,
      createdById: req.user!.sub,
    })
    .returning();
  const hydrated = await getCaseById(org, created.id);
  await recordAudit({ req, action: 'CREATE', entityType: 'Case', entityId: created.id, newValues: created });
  return hydrated;
}

export async function updateCase(req: Request, id: string, input: any) {
  const org = orgId(req);
  const before = await db.query.cases.findFirst({ where: and(eq(cases.organizationId, org), eq(cases.id, id)) });
  if (!before) throw ApiError.notFound('Case not found');

  const data: any = { ...input, updatedAt: new Date() };
  const statusChanged = input.status !== undefined && input.status !== before.status;
  if (statusChanged) {
    // Mirrors tasks.service.ts's completedAt-on-COMPLETED side effect: both timestamps are only
    // ever derived from a status transition, never accepted directly from the request body (the
    // validation schema has no resolvedAt/closedAt field at all). Re-derived from scratch on every
    // transition (not just "set once") so every case in {RESOLVED, CLOSED} status has resolvedAt
    // set, every non-terminal status has neither set, and CLOSED<->RESOLVED toggling keeps closedAt
    // in sync — while never clobbering an already-recorded resolvedAt with a new "now".
    data.resolvedAt = input.status === 'RESOLVED' || input.status === 'CLOSED' ? before.resolvedAt ?? new Date() : null;
    data.closedAt = input.status === 'CLOSED' ? before.closedAt ?? new Date() : null;
  }

  const [updated] = await db.update(cases).set(data).where(eq(cases.id, id)).returning();
  await recordAudit({
    req,
    action: statusChanged ? 'STATUS_CHANGED' : 'UPDATE',
    entityType: 'Case',
    entityId: id,
    oldValues: before,
    newValues: updated,
  });
  return getCaseById(org, id);
}

export async function deleteCase(req: Request, id: string) {
  const org = orgId(req);
  const before = await db.query.cases.findFirst({ where: and(eq(cases.organizationId, org), eq(cases.id, id)) });
  if (!before) throw ApiError.notFound('Case not found');
  await db.delete(cases).where(eq(cases.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Case', entityId: id, oldValues: before });
}
