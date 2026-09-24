import { Request } from 'express';
import { and, asc, count, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { organizations, users, leads, subscriptions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { getPlan, PLANS } from '@/modules/billing/plans';
import { loadUserWithPermissions } from '@/modules/auth/auth.service';
import { signImpersonationToken } from '@/utils/tokens';

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
      // isPlatformAdmin rides along purely so the frontend can hide the Impersonate action on a
      // platform admin's own row (this org's real members are never platform admins in practice,
      // but the Internal Ops org itself can show up here like any other) — the backend re-checks
      // this independently in impersonateUser below regardless of what the UI shows.
      columns: { id: true, email: true, firstName: true, lastName: true, isActive: true, isPlatformAdmin: true, lastLoginAt: true, createdAt: true },
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

// Phase 13 (super admin), slice 2 — user impersonation. Issues a short-lived, non-refreshable
// access token for the target user (see utils/tokens.ts's signImpersonationToken) so a platform
// admin can view/reproduce the app exactly as that user sees it, for support. Two things are
// checked before minting anything, on top of the route's own requirePlatformAdmin gate:
// - the target must be active (impersonating a disabled account can't reproduce anything real);
// - the target must NOT themselves be a platform admin — this is what actually closes the
//   escalation path, together with signImpersonationToken hardcoding isPlatformAdmin: false on
//   the token it issues regardless of the target's own row.
export async function impersonateUser(req: Request, targetUserId: string) {
  const loaded = await loadUserWithPermissions(targetUserId);
  if (!loaded) throw ApiError.notFound('User not found');
  const { user, permissions } = loaded;

  if (!user.isActive) throw ApiError.badRequest('Cannot impersonate a disabled user');
  if (user.isPlatformAdmin) throw ApiError.badRequest('Cannot impersonate another platform admin');

  const platformAdminId = req.user!.sub;
  const platformAdminEmail = req.user!.email;

  const accessToken = signImpersonationToken({
    sub: user.id,
    email: user.email,
    role: user.role.name,
    permissions,
    organizationId: user.organizationId,
    impersonation: { platformAdminId, platformAdminEmail },
  });

  // organizationId is the impersonated user's org, not the platform admin's own home org — same
  // override reasoning as setOrganizationActive above; userId defaults to req.user.sub, which at
  // this point in the request IS still the platform admin's own token (the swap only happens
  // client-side, after this response comes back), so no userId override is needed here — unlike
  // endImpersonation's, which runs under the impersonation token itself.
  await recordAudit({
    req,
    action: 'IMPERSONATION_START',
    entityType: 'User',
    entityId: user.id,
    organizationId: user.organizationId,
    newValues: { platformAdminEmail },
  });

  const { passwordHash, organization, ...safeUser } = user;
  return { accessToken, user: { ...safeUser, permissions, role: user.role.name } };
}

// Phase 13 (super admin), slice 3 — platform-wide metrics. Aggregates ACROSS every organization,
// same "deliberate exception" as every other function in this file.
export async function getPlatformMetrics() {
  const [[{ value: organizationsTotal }], [{ value: organizationsActive }], [{ value: usersTotal }], [{ value: leadsTotal }], planCounts, signupTrend] =
    await Promise.all([
      db.select({ value: count() }).from(organizations),
      db.select({ value: count() }).from(organizations).where(eq(organizations.isActive, true)),
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(leads),
      // A subscriptions row is only ever created lazily, the first time an organization touches
      // any billing endpoint (billing.service.ts's getOrCreateSubscription) — most organizations,
      // especially ones that have never opened their own Billing page, have NO row at all. A
      // plain GROUP BY on subscriptions alone would silently drop every one of those from this
      // breakdown entirely (not double-count them as FREE — just omit them), which is why this
      // starts from organizations and LEFT JOINs, exactly mirroring orgUsageCounts' own
      // "no row yet means FREE" default above rather than assuming Phase 12 backfilled one for
      // every existing org (it didn't).
      db
        .select({ planId: sql<string>`coalesce(${subscriptions.planId}, 'FREE')`, value: count() })
        .from(organizations)
        .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
        .groupBy(sql`coalesce(${subscriptions.planId}, 'FREE')`),
      // Mirrors dashboard.service.ts's own monthlyTrends query (raw SQL for date_trunc/to_char),
      // just platform-wide instead of scoped to one organization's leads.
      db.execute<{ month: string; count: string }>(sql`
        SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
        FROM organizations
        WHERE "created_at" > NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1 ASC
      `),
    ]);

  const planCountMap = new Map(planCounts.map((p) => [p.planId, Number(p.value)]));
  const organizationsByPlan = Object.values(PLANS).map((plan) => ({
    planId: plan.id,
    planName: plan.name,
    count: planCountMap.get(plan.id) ?? 0,
  }));

  return {
    totals: {
      organizations: Number(organizationsTotal),
      activeOrganizations: Number(organizationsActive),
      suspendedOrganizations: Number(organizationsTotal) - Number(organizationsActive),
      users: Number(usersTotal),
      leads: Number(leadsTotal),
    },
    organizationsByPlan,
    signupTrend: (signupTrend.rows as any[]).map((r) => ({ month: r.month, count: Number(r.count) })),
  };
}
