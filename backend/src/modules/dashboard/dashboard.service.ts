import { and, eq, gte, inArray, lt, sql, count } from 'drizzle-orm';
import { db } from '@/config/db';
import { leads, meetings, companies, campaigns, users } from '@/db/schema';
import { cache } from '@/config/redis';
import type { DashboardSummaryQuery } from './dashboard.validation';

const CACHE_TTL_SECONDS = 60;
const OPEN_OPPORTUNITY_STATUSES = ['QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED', 'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION'] as const;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface PeriodRange {
  from: Date;
  to: Date;
  cacheKeySuffix: string;
  label: string;
}

/** Resolves the requested period filter into a concrete [from, to) date range, or null for "all time". */
function resolvePeriodRange(filter?: DashboardSummaryQuery): PeriodRange | null {
  if (!filter || filter.period === 'all') return null;

  if (filter.period === 'year') {
    const year = filter.year!;
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
      cacheKeySuffix: `year:${year}`,
      label: String(year),
    };
  }

  if (filter.period === 'quarter') {
    const year = filter.year!;
    const quarter = filter.quarter!;
    const startMonth = (quarter - 1) * 3;
    return {
      from: new Date(Date.UTC(year, startMonth, 1)),
      to: new Date(Date.UTC(year, startMonth + 3, 1)),
      cacheKeySuffix: `quarter:${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
    };
  }

  // month
  const year = filter.year!;
  const month = filter.month!;
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
    cacheKeySuffix: `month:${year}-${String(month).padStart(2, '0')}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

export async function getDashboardSummary(filter?: DashboardSummaryQuery) {
  const range = resolvePeriodRange(filter);
  const cacheKey = range ? `dashboard:summary:${range.cacheKeySuffix}` : 'dashboard:summary';
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  // Applied to every lead-based query below when a period filter is active; left out entirely
  // (queries computed over all-time data) when it isn't, so the no-filter behavior is unchanged.
  const leadDateCond = range ? and(gte(leads.createdAt, range.from), lt(leads.createdAt, range.to)) : undefined;
  const withLeadDate = (...conds: any[]) => (leadDateCond ? and(...conds, leadDateCond) : and(...conds));

  const [
    [{ value: totalLeads }],
    [{ value: qualifiedLeads }],
    [{ value: meetingsCount }],
    [{ value: opportunities }],
    [{ value: wins }],
    [{ value: losses }],
    statusBreakdown,
    sourceBreakdown,
    countryBreakdown,
    campaignRows,
    repRows,
    monthlyTrends,
  ] = await Promise.all([
    db.select({ value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true))),
    db.select({ value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true), inArray(leads.status, [...OPEN_OPPORTUNITY_STATUSES]))),
    range
      ? db.select({ value: count() }).from(meetings).where(and(gte(meetings.scheduledAt, range.from), lt(meetings.scheduledAt, range.to)))
      : db.select({ value: count() }).from(meetings),
    db.select({ value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true), inArray(leads.status, ['PROPOSAL_SENT', 'NEGOTIATION']))),
    db.select({ value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true), eq(leads.status, 'WON'))),
    db.select({ value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true), eq(leads.status, 'LOST'))),
    db.select({ status: leads.status, value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true))).groupBy(leads.status),
    db.select({ source: leads.source, value: count() }).from(leads).where(withLeadDate(eq(leads.isActive, true))).groupBy(leads.source),
    range
      ? db
          .select({ country: companies.country, value: count() })
          .from(leads)
          .innerJoin(companies, eq(leads.companyId, companies.id))
          .where(withLeadDate(eq(leads.isActive, true), sql`${companies.country} IS NOT NULL`))
          .groupBy(companies.country)
          .orderBy(sql`count(*) DESC`)
          .limit(10)
      : db
          .select({ country: companies.country, value: count() })
          .from(companies)
          .where(sql`${companies.country} IS NOT NULL`)
          .groupBy(companies.country)
          .orderBy(sql`count(*) DESC`)
          .limit(10),
    db.query.campaigns.findMany({ with: { leads: { columns: { status: true, createdAt: true } } } }),
    db.query.users.findMany({
      where: eq(users.isActive, true),
      with: {
        role: { columns: { name: true } },
        assignedLeads: { columns: { id: true, status: true, createdAt: true } },
        ownedLeads: { columns: { id: true, status: true, createdAt: true } },
      },
    }),
    range
      ? db.execute<{ month: string; count: string }>(sql`
          SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
          FROM leads
          WHERE "created_at" >= ${range.from} AND "created_at" < ${range.to}
          GROUP BY 1 ORDER BY 1 ASC
        `)
      : db.execute<{ month: string; count: string }>(sql`
          SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
          FROM leads
          WHERE "created_at" > NOW() - INTERVAL '12 months'
          GROUP BY 1 ORDER BY 1 ASC
        `),
  ]);

  // The campaigns/reps queries above intentionally fetch each lead's full history (not just the
  // selected period) so the same relational query can serve every filter — narrow them down here.
  const inRange = (createdAt: Date | string) => {
    if (!range) return true;
    const d = new Date(createdAt);
    return d >= range.from && d < range.to;
  };

  const closedCount = Number(wins) + Number(losses);
  const conversionRate = closedCount > 0 ? Number(((Number(wins) / closedCount) * 100).toFixed(1)) : 0;

  const summary = {
    kpis: {
      totalLeads: Number(totalLeads),
      qualifiedLeads: Number(qualifiedLeads),
      meetingsCount: Number(meetingsCount),
      opportunities: Number(opportunities),
      wins: Number(wins),
      losses: Number(losses),
      conversionRate,
    },
    pipelineByStatus: statusBreakdown.map((s) => ({ status: s.status, count: Number(s.value) })),
    leadSourceAnalytics: sourceBreakdown.map((s) => ({ source: s.source, count: Number(s.value) })),
    countryDistribution: countryBreakdown.map((c) => ({ country: c.country, count: Number(c.value) })),
    campaignPerformance: campaignRows
      .map((c) => ({ ...c, leads: c.leads.filter((l) => inRange(l.createdAt)) }))
      .filter((c) => c.leads.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        totalLeads: c.leads.length,
        won: c.leads.filter((l) => l.status === 'WON').length,
        lost: c.leads.filter((l) => l.status === 'LOST').length,
      })),
    representativePerformance: repRows
      .map((u) => ({
        ...u,
        assignedLeads: u.assignedLeads.filter((l) => inRange(l.createdAt)),
        ownedLeads: u.ownedLeads.filter((l) => inRange(l.createdAt)),
      }))
      .filter((u) => u.assignedLeads.length > 0 || u.ownedLeads.length > 0)
      .map((u) => {
        const all = [...u.assignedLeads, ...u.ownedLeads];
        return {
          userId: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role.name,
          totalLeads: all.length,
          won: all.filter((l) => l.status === 'WON').length,
          lost: all.filter((l) => l.status === 'LOST').length,
          inProgress: all.filter((l) => !['WON', 'LOST', 'DISQUALIFIED'].includes(l.status)).length,
        };
      }),
    monthlyTrends: (monthlyTrends.rows as any[]).map((m) => ({ month: m.month, count: Number(m.count) })),
    appliedPeriod: range
      ? { period: filter!.period, year: filter!.year, quarter: filter!.quarter, month: filter!.month, label: range.label }
      : { period: 'all' as const, label: 'All Time' },
  };

  await cache.set(cacheKey, summary, CACHE_TTL_SECONDS);
  return summary;
}
