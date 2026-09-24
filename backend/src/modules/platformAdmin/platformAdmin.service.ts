import { Request } from 'express';
import { and, asc, count, desc, eq, ilike, or, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { organizations, users, leads, subscriptions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { getPlan } from '@/modules/billing/plans';

// Phase 13 (super admin), slice 1 — organization management console. Every function here is the
// deliberate exception to this codebase's usual "every query is scoped by the caller's own
// organizationId" rule (see utils/tenant.ts's orgId()) — these read and act ACROSS every
// organization on the platform, which is exactly why every route in platformAdmin.routes.ts is
// gated on requirePlatformAdmin rather than any ordinary permission.

async function orgUsageCounts(organizationId: string) {
  const [[{ value: userCount }], [{ value: leadCount }], subscription] = await Promise.all([
    db.select({ value: count() }).from(users).where(eq(users.organizationId, organizationId)),
    db.select({ value: count() }).from(leads).where(eq(leads.organizationId, organizationId)),
    db.query.subscriptions.findFirst({ where: eq(subscriptions.organizationId, organizationId) }),
  ]);
  // Mirrors billing.service.ts's getOrCreateSubscription default — an org with no subscriptions
  // row yet (never viewed its own Billing page) is still on FREE, without inserting a row here
  // just from a platform admin looking at the list.
  const plan = getPlan(subscription?.planId ?? 'FREE');
  return {
    userCount: Number(userCount),
    leadCount: Number(leadCount),
    plan: { id: plan.id, name: plan.name },
    subscriptionStatus: subscription?.status ?? 'ACTIVE',
  };
}

export async function listOrganizations(query: {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [];
  if (query.search) {
    conditions.push(or(ilike(organizations.name, `%${query.search}%`), ilike(organizations.slug, `%${query.search}%`))!);
  }
  if (query.isActive !== undefined) conditions.push(eq(organizations.isActive, query.isActive));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortable: Record<string, any> = { name: organizations.name, createdAt: organizations.createdAt };
  const orderCol = sortable[query.sortBy ?? ''] ?? organizations.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.organizations.findMany({ where, orderBy, ...toLimitOffset(query.page, query.pageSize) }),
    db.select({ value: count() }).from(organizations).where(where),
  ]);

  const data = await Promise.all(rows.map(async (org) => ({ ...org, ...(await orgUsageCounts(org.id)) })));

  return { data, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getOrganizationDetail(id: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!org) throw ApiError.notFound('Organization not found');

  const [usage, orgUsers] = await Promise.all([
    orgUsageCounts(id),
    db.query.users.findMany({
      where: eq(users.organizationId, id),
      columns: { id: true, email: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true, createdAt: true },
      with: { role: { columns: { name: true } } },
      orderBy: desc(users.createdAt),
    }),
  ]);

  return { ...org, ...usage, users: orgUsers };
}

export async function setOrganizationActive(req: Request, id: string, isActive: boolean) {
  const existing = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!existing) throw ApiError.notFound('Organization not found');

  const [updated] = await db.update(organizations).set({ isActive, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();

  // organizationId is the org being ACTED ON, not the platform admin's own home org — recordAudit
  // takes that as an explicit override for exactly this reason (see its own comment).
  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'Organization',
    entityId: id,
    oldValues: { isActive: existing.isActive },
    newValues: { isActive },
    organizationId: id,
  });

  return updated;
}
