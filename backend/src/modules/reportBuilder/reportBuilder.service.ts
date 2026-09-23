import { Request } from 'express';
import { and, asc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { db } from '@/config/db';
import { customReportDefinitions, leads, campaigns, users, companies } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { PERMISSIONS } from '@/utils/permissions';
import type { ReportFilters, RunReportInput } from './reportBuilder.validation';

type CustomReportDefinition = typeof customReportDefinitions.$inferSelect;

function canManageShared(req: Request): boolean {
  return req.user!.permissions.includes(PERMISSIONS.REPORTS_MANAGE_SHARED);
}

// ----------------------------------------------------------------------------
// CRUD — copied exactly from savedViews.service.ts's ownership/shared model (Phase 7 precedent):
// personal by default (visible/editable only by its creator), isShared makes it org-wide and
// gates create/edit/delete behind REPORTS_MANAGE_SHARED regardless of who created it.
// ----------------------------------------------------------------------------

export async function listReportDefinitions(req: Request, entityType: string): Promise<CustomReportDefinition[]> {
  const org = orgId(req);
  const userId = req.user!.sub;
  return db.query.customReportDefinitions.findMany({
    where: and(
      eq(customReportDefinitions.organizationId, org),
      eq(customReportDefinitions.entityType, entityType),
      or(eq(customReportDefinitions.isShared, true), eq(customReportDefinitions.createdById, userId))
    ),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

async function getOwnedOrSharedReportDefinition(req: Request, id: string): Promise<CustomReportDefinition> {
  const org = orgId(req);
  const row = await db.query.customReportDefinitions.findFirst({
    where: and(eq(customReportDefinitions.organizationId, org), eq(customReportDefinitions.id, id)),
  });
  if (!row) throw ApiError.notFound('Report not found');

  const userId = req.user!.sub;
  if (!row.isShared && row.createdById !== userId) throw ApiError.notFound('Report not found');
  return row;
}

export async function getReportDefinitionById(req: Request, id: string): Promise<CustomReportDefinition> {
  return getOwnedOrSharedReportDefinition(req, id);
}

export async function createReportDefinition(
  req: Request,
  input: {
    entityType: string;
    name: string;
    description?: string;
    groupBy: string;
    metric: string;
    chartType: string;
    filters: ReportFilters;
    isShared: boolean;
  }
): Promise<CustomReportDefinition> {
  const org = orgId(req);
  const userId = req.user!.sub;

  if (input.isShared && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared reports can create a shared report');
  }

  const existing = await db.query.customReportDefinitions.findFirst({
    where: and(
      eq(customReportDefinitions.organizationId, org),
      eq(customReportDefinitions.entityType, input.entityType),
      eq(customReportDefinitions.createdById, userId),
      eq(customReportDefinitions.name, input.name)
    ),
  });
  if (existing) throw ApiError.conflict('You already have a report with this name');

  const [created] = await db
    .insert(customReportDefinitions)
    .values({
      organizationId: org,
      entityType: input.entityType,
      name: input.name,
      description: input.description,
      groupBy: input.groupBy,
      metric: input.metric,
      chartType: input.chartType,
      filters: input.filters,
      isShared: input.isShared,
      createdById: userId,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'CustomReportDefinition', entityId: created.id, newValues: created });
  return created;
}

export async function updateReportDefinition(
  req: Request,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    groupBy?: string;
    metric?: string;
    chartType?: string;
    filters?: ReportFilters;
    isShared?: boolean;
  }
): Promise<CustomReportDefinition> {
  const before = await getOwnedOrSharedReportDefinition(req, id);
  const userId = req.user!.sub;

  const nextIsShared = input.isShared ?? before.isShared;
  if ((before.isShared || nextIsShared) && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared reports can edit one');
  }
  if (!before.isShared && before.createdById !== userId) {
    throw ApiError.forbidden('You can only edit your own reports');
  }

  const [updated] = await db
    .update(customReportDefinitions)
    .set({
      name: input.name ?? before.name,
      description: input.description === undefined ? before.description : input.description,
      groupBy: input.groupBy ?? before.groupBy,
      metric: input.metric ?? before.metric,
      chartType: input.chartType ?? before.chartType,
      filters: input.filters ?? before.filters,
      isShared: nextIsShared,
      updatedAt: new Date(),
    })
    .where(eq(customReportDefinitions.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'CustomReportDefinition', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteReportDefinition(req: Request, id: string): Promise<void> {
  const before = await getOwnedOrSharedReportDefinition(req, id);
  const userId = req.user!.sub;

  if (before.isShared && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared reports can delete one');
  }
  if (!before.isShared && before.createdById !== userId) {
    throw ApiError.forbidden('You can only delete your own reports');
  }

  await db.delete(customReportDefinitions).where(eq(customReportDefinitions.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'CustomReportDefinition', entityId: id, oldValues: before });
}

// ----------------------------------------------------------------------------
// Running a report — either ad-hoc (preview before saving) or a saved definition. One dimension
// per groupBy value, each its own query branch (mirrors dashboard.service.ts's own style of
// explicit per-dimension queries rather than a fully generic query builder) — every branch shares
// the same tenant + filter WHERE clause, built once below.
// ----------------------------------------------------------------------------

export interface ReportRow {
  key: string;
  label: string;
  value: number;
}
export interface ReportResult {
  groupBy: string;
  metric: string;
  chartType: string;
  rows: ReportRow[];
  totalValue: number;
}

function buildBaseConditions(org: string, filters: ReportFilters) {
  const conditions = [eq(leads.organizationId, org)];
  if (!filters.includeInactive) conditions.push(eq(leads.isActive, true));
  if (filters.status) conditions.push(eq(leads.status, filters.status as any));
  if (filters.priority) conditions.push(eq(leads.priority, filters.priority as any));
  if (filters.source) conditions.push(eq(leads.source, filters.source as any));
  if (filters.campaignId) conditions.push(eq(leads.campaignId, filters.campaignId));
  if (filters.assignedToId) conditions.push(eq(leads.assignedToId, filters.assignedToId));
  if (filters.ownerId) conditions.push(eq(leads.currentOwnerId, filters.ownerId));

  if (filters.dateField && (filters.dateFrom || filters.dateTo)) {
    const col = filters.dateField === 'leadReceivedDate' ? leads.leadReceivedDate : leads.createdAt;
    if (filters.dateFrom) conditions.push(gte(col, new Date(filters.dateFrom)));
    if (filters.dateTo) {
      // Exclusive upper bound one day past dateTo, so the whole of dateTo's calendar day is
      // included — same pattern dashboard.service.ts's resolvePeriodRange uses for month/quarter/
      // year ranges.
      const to = new Date(filters.dateTo);
      to.setUTCDate(to.getUTCDate() + 1);
      conditions.push(lt(col, to));
    }
  }
  return conditions;
}

function metricExpr(metric: string) {
  if (metric === 'SUM_DEAL_VALUE') return sql<string>`coalesce(sum(${leads.dealValue}), 0)`;
  if (metric === 'AVG_DEAL_VALUE') return sql<string>`coalesce(avg(${leads.dealValue}), 0)`;
  return sql<string>`count(*)`;
}

async function runGroupedQuery(org: string, config: RunReportInput): Promise<ReportRow[]> {
  const where = and(...buildBaseConditions(org, config.filters));
  const value = metricExpr(config.metric);

  switch (config.groupBy) {
    case 'STATUS': {
      const rows = await db.select({ key: leads.status, value }).from(leads).where(where).groupBy(leads.status);
      return rows.map((r) => ({ key: String(r.key), label: String(r.key), value: Number(r.value) }));
    }
    case 'PRIORITY': {
      const rows = await db.select({ key: leads.priority, value }).from(leads).where(where).groupBy(leads.priority);
      return rows.map((r) => ({ key: String(r.key), label: String(r.key), value: Number(r.value) }));
    }
    case 'SOURCE': {
      const rows = await db.select({ key: leads.source, value }).from(leads).where(where).groupBy(leads.source);
      return rows.map((r) => ({ key: String(r.key), label: String(r.key), value: Number(r.value) }));
    }
    case 'CAMPAIGN': {
      const rows = await db
        .select({ key: leads.campaignId, label: campaigns.name, value })
        .from(leads)
        .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
        .where(where)
        .groupBy(leads.campaignId, campaigns.name);
      return rows.map((r) => ({ key: r.key ?? 'none', label: r.label ?? 'No Campaign', value: Number(r.value) }));
    }
    case 'ASSIGNED_TO': {
      const rows = await db
        .select({ key: leads.assignedToId, firstName: users.firstName, lastName: users.lastName, value })
        .from(leads)
        .leftJoin(users, eq(leads.assignedToId, users.id))
        .where(where)
        .groupBy(leads.assignedToId, users.firstName, users.lastName);
      return rows.map((r) => ({
        key: r.key ?? 'none',
        label: r.key ? `${r.firstName} ${r.lastName}` : 'Unassigned',
        value: Number(r.value),
      }));
    }
    case 'OWNER': {
      const rows = await db
        .select({ key: leads.currentOwnerId, firstName: users.firstName, lastName: users.lastName, value })
        .from(leads)
        .leftJoin(users, eq(leads.currentOwnerId, users.id))
        .where(where)
        .groupBy(leads.currentOwnerId, users.firstName, users.lastName);
      return rows.map((r) => ({
        key: r.key ?? 'none',
        label: r.key ? `${r.firstName} ${r.lastName}` : 'No Owner',
        value: Number(r.value),
      }));
    }
    case 'COUNTRY': {
      const rows = await db
        .select({ key: companies.country, value })
        .from(leads)
        .leftJoin(companies, eq(leads.companyId, companies.id))
        .where(where)
        .groupBy(companies.country);
      return rows.map((r) => ({ key: r.key ?? 'unknown', label: r.key ?? 'Unknown', value: Number(r.value) }));
    }
    case 'INDUSTRY': {
      const rows = await db
        .select({ key: companies.industry, value })
        .from(leads)
        .leftJoin(companies, eq(leads.companyId, companies.id))
        .where(where)
        .groupBy(companies.industry);
      return rows.map((r) => ({ key: r.key ?? 'unknown', label: r.key ?? 'Unknown', value: Number(r.value) }));
    }
    case 'CREATED_MONTH':
    case 'LEAD_RECEIVED_MONTH': {
      const dateCol = config.groupBy === 'CREATED_MONTH' ? leads.createdAt : leads.leadReceivedDate;
      const month = sql<string>`to_char(date_trunc('month', ${dateCol}), 'YYYY-MM')`;
      const rows = await db
        .select({ key: month, value })
        .from(leads)
        .where(where)
        .groupBy(month)
        .orderBy(asc(month));
      return rows.map((r) => ({ key: r.key, label: r.key, value: Number(r.value) }));
    }
    default:
      // Unreachable — reportGroupBySchema (an exhaustive z.enum) rejects anything else before this
      // ever runs. Kept as a defensive throw rather than a TS `never` assertion so a future new
      // groupBy value fails loudly here instead of silently returning no rows.
      throw ApiError.badRequest(`Unsupported groupBy: ${config.groupBy}`);
  }
}

export async function runReport(org: string, config: RunReportInput): Promise<ReportResult> {
  const rows = await runGroupedQuery(org, config);
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  return { groupBy: config.groupBy, metric: config.metric, chartType: config.chartType, rows, totalValue };
}

export async function runSavedReport(req: Request, id: string): Promise<ReportResult> {
  const def = await getOwnedOrSharedReportDefinition(req, id);
  return runReport(orgId(req), {
    entityType: def.entityType as RunReportInput['entityType'],
    groupBy: def.groupBy as RunReportInput['groupBy'],
    metric: def.metric as RunReportInput['metric'],
    chartType: def.chartType as RunReportInput['chartType'],
    filters: def.filters as ReportFilters,
  });
}
