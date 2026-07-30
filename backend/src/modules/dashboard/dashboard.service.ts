import { and, eq, inArray, sql, count } from 'drizzle-orm';
import { db } from '@/config/db';
import { leads, meetings, companies, campaigns, users } from '@/db/schema';
import { cache } from '@/config/redis';

const CACHE_TTL_SECONDS = 60;
const OPEN_OPPORTUNITY_STATUSES = ['QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED', 'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION'] as const;

export async function getDashboardSummary() {
  const cacheKey = 'dashboard:summary';
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

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
    db.select({ value: count() }).from(leads).where(eq(leads.isActive, true)),
    db.select({ value: count() }).from(leads).where(and(eq(leads.isActive, true), inArray(leads.status, [...OPEN_OPPORTUNITY_STATUSES]))),
    db.select({ value: count() }).from(meetings),
    db.select({ value: count() }).from(leads).where(and(eq(leads.isActive, true), inArray(leads.status, ['PROPOSAL_SENT', 'NEGOTIATION']))),
    db.select({ value: count() }).from(leads).where(and(eq(leads.isActive, true), eq(leads.status, 'WON'))),
    db.select({ value: count() }).from(leads).where(and(eq(leads.isActive, true), eq(leads.status, 'LOST'))),
    db.select({ status: leads.status, value: count() }).from(leads).where(eq(leads.isActive, true)).groupBy(leads.status),
    db.select({ source: leads.source, value: count() }).from(leads).where(eq(leads.isActive, true)).groupBy(leads.source),
    db
      .select({ country: companies.country, value: count() })
      .from(companies)
      .where(sql`${companies.country} IS NOT NULL`)
      .groupBy(companies.country)
      .orderBy(sql`count(*) DESC`)
      .limit(10),
    db.query.campaigns.findMany({ with: { leads: { columns: { status: true } } } }),
    db.query.users.findMany({
      where: eq(users.isActive, true),
      with: {
        role: { columns: { name: true } },
        assignedLeads: { columns: { id: true, status: true } },
        ownedLeads: { columns: { id: true, status: true } },
      },
    }),
    db.execute<{ month: string; count: string }>(sql`
      SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM leads
      WHERE "created_at" > NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1 ASC
    `),
  ]);

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
  };

  await cache.set(cacheKey, summary, CACHE_TTL_SECONDS);
  return summary;
}
