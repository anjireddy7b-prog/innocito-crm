import { z } from 'zod';

// Phase 10 (reporting/dashboard builder), slice 1 — custom report builder. Deliberately LEAD-only
// for now, same LEAD-only-first precedent as savedViewEntityTypeSchema (see db/schema.ts's
// customReportDefinitions comment).
export const reportEntityTypeSchema = z.literal('LEAD');

// The dimension a report groups its leads by. STATUS/PRIORITY/SOURCE group by the lead's own
// column; CAMPAIGN/ASSIGNED_TO/OWNER group by an FK, labeled via a join; COUNTRY/INDUSTRY group by
// the lead's company (leads with no company fall into an "Unknown" bucket); CREATED_MONTH/
// LEAD_RECEIVED_MONTH group by a truncated date. See reportBuilder.service.ts's runReport for the
// per-dimension query branch.
export const REPORT_GROUP_BY_OPTIONS = [
  'STATUS', 'PRIORITY', 'SOURCE', 'CAMPAIGN', 'ASSIGNED_TO', 'OWNER', 'COUNTRY', 'INDUSTRY',
  'CREATED_MONTH', 'LEAD_RECEIVED_MONTH',
] as const;
export const reportGroupBySchema = z.enum(REPORT_GROUP_BY_OPTIONS);

export const REPORT_METRIC_OPTIONS = ['COUNT', 'SUM_DEAL_VALUE', 'AVG_DEAL_VALUE'] as const;
export const reportMetricSchema = z.enum(REPORT_METRIC_OPTIONS);

export const REPORT_CHART_TYPE_OPTIONS = ['TABLE', 'BAR', 'PIE', 'LINE'] as const;
export const reportChartTypeSchema = z.enum(REPORT_CHART_TYPE_OPTIONS);

export const REPORT_DATE_FIELD_OPTIONS = ['createdAt', 'leadReceivedDate'] as const;

// A small structured filter bag, every field single-valued — mirrors LeadsListPage's own
// single-value-per-field filter bar (and thus savedViews.filters), not a multi-select query
// builder. See db/schema.ts's customReportDefinitions comment for why country/industry are
// groupBy-only, never also a filter, in this slice.
export const reportFiltersSchema = z
  .object({
    status: z.string().trim().min(1).optional(),
    priority: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).optional(),
    campaignId: z.string().uuid().optional(),
    assignedToId: z.string().uuid().optional(),
    ownerId: z.string().uuid().optional(),
    dateField: z.enum(REPORT_DATE_FIELD_OPTIONS).optional(),
    dateFrom: z.string().trim().min(1).optional(),
    dateTo: z.string().trim().min(1).optional(),
    // Every other report/dashboard query in this app defaults to isActive-only leads (see
    // dashboard.service.ts, reports.routes.ts) — this mirrors that default rather than requiring
    // every saved report to opt into it explicitly.
    includeInactive: z.boolean().default(false),
  })
  .default({});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const listReportDefinitionsQuerySchema = z.object({
  entityType: reportEntityTypeSchema.default('LEAD'),
});

const reportConfigShape = {
  entityType: reportEntityTypeSchema.default('LEAD'),
  groupBy: reportGroupBySchema,
  metric: reportMetricSchema.default('COUNT'),
  chartType: reportChartTypeSchema.default('BAR'),
  filters: reportFiltersSchema,
};

export const createReportDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  ...reportConfigShape,
  isShared: z.boolean().default(false),
});

export const updateReportDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  groupBy: reportGroupBySchema.optional(),
  metric: reportMetricSchema.optional(),
  chartType: reportChartTypeSchema.optional(),
  filters: reportFiltersSchema.optional(),
  isShared: z.boolean().optional(),
});

// Ad-hoc "preview before saving" run — same shape as a saved definition's config, without the
// name/description/isShared bookkeeping.
export const runReportSchema = z.object(reportConfigShape);
export type RunReportInput = z.infer<typeof runReportSchema>;
