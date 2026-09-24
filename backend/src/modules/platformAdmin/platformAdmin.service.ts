import { Request } from 'express';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { organizations, users, leads, subscriptions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { cache } from '@/config/redis';
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

  // Phase 15 (scale readiness) — this used to call orgUsageCounts() once PER ROW via
  // Promise.all(rows.map(...)), i.e. 3 extra queries per org (userCount, leadCount, subscription)
  // on top of the 2 above — 3*pageSize+2 queries for one page of this list (77 for the default
  // pageSize of 25), where every one of those per-org queries differed only in which
  // organizationId it filtered on. Below is the exact same three pieces of data, but each fetched
  // ONCE for the whole page via a GROUP BY / IN — 5 queries total regardless of pageSize — then
  // joined back onto each row in memory. getOrganizationDetail below still calls orgUsageCounts()
  // directly: for a single org, the N+1 shape this fixes doesn't apply, and reusing the exact same
  // "no subscriptions row yet means FREE" logic in one shared helper is worth more there than the
  // marginal savings of also batching a already-single-org call.
  const orgIds = rows.map((org) => org.id);
  const [userCounts, leadCounts, subs] = orgIds.length
    ? await Promise.all([
        db.select({ organizationId: users.organizationId, value: count() }).from(users).where(inArray(users.organizationId, orgIds)).groupBy(users.organizationId),
        db.select({ organizationId: leads.organizationId, value: count() }).from(leads).where(inArray(leads.organizationId, orgIds)).groupBy(leads.organizationId),
        db.query.subscriptions.findMany({ where: inArray(subscriptions.organizationId, orgIds) }),
      ])
    : [[], [], []];
  const userCountByOrg = new Map(userCounts.map((r) => [r.organizationId, Number(r.value)]));
  const leadCountByOrg = new Map(leadCounts.map((r) => [r.organizationId, Number(r.value)]));
  const subByOrg = new Map(subs.map((s) => [s.organizationId, s]));

  const data = rows.map((org) => {
    const subscription = subByOrg.get(org.id);
    // Same "no subscriptions row yet means FREE" default as orgUsageCounts below.
    const plan = getPlan(subscription?.planId ?? 'FREE');
    return {
      ...org,
      userCount: userCountByOrg.get(org.id) ?? 0,
      leadCount: leadCountByOrg.get(org.id) ?? 0,
      plan: { id: plan.id, name: plan.name },
      subscriptionStatus: subscription?.status ?? 'ACTIVE',
    };
  });

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

  // Phase 15 (security hardening) — mfaSecretEnc/mfaBackupCodes excluded same as passwordHash;
  // see auth.service.ts's identical exclusion in issueSession/getCurrentUser for why.
  const { passwordHash, organization, mfaSecretEnc, mfaBackupCodes, ...safeUser } = user;
  return { accessToken, user: { ...safeUser, permissions, role: user.role.name } };
}

// Phase 13 (super admin), slice 3 — platform-wide metrics. Aggregates ACROSS every organization,
// same "deliberate exception" as every other function in this file.
//
// Phase 15 (scale readiness) — this is 6 queries including a 12-month raw-SQL trend scan across
// EVERY organization's rows, run fresh on every single load of a page that's viewed rarely (only
// platform admins, only occasionally) and never time-critical to the second. Cached the exact same
// way dashboard.service.ts's own getDashboardSummary caches its (comparably heavy, comparably
// infrequently-viewed) query — a flat TTL, no explicit invalidation on every mutation that could
// move these numbers (an org signing up, a lead being created, a subscription changing plan...).
// dashboard.service.ts already accepts that same tradeoff for anything outside leads/companies/
// duplicates (e.g. it doesn't invalidate on a new user either) — a platform admin looking at a
// count that's up to a minute stale is a fair trade for not scattering cache.del calls across
// organizations.service.ts, users.service.ts, leads.service.ts and billing.service.ts alike. No
// per-org namespacing needed in the key (contrast dashboard's cacheKey, which IS namespaced by
// org) — this data isn't scoped to any one tenant in the first place.
const PLATFORM_METRICS_CACHE_KEY = 'platform-admin:metrics';
const PLATFORM_METRICS_CACHE_TTL_SECONDS = 60;

export async function getPlatformMetrics() {
  const cached = await cache.get(PLATFORM_METRICS_CACHE_KEY);
  if (cached) return cached;

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

  const metrics = {
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

  await cache.set(PLATFORM_METRICS_CACHE_KEY, metrics, PLATFORM_METRICS_CACHE_TTL_SECONDS);
  return metrics;
}
