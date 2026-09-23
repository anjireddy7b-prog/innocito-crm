import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 10 (reporting/dashboard builder), slice 1 — custom report builder. Deliberately LEAD-only
// for now (entityType stays a plain string, mirroring savedViews.ts) — see
// backend/src/db/schema.ts's customReportDefinitions comment.

export const REPORT_GROUP_BY_OPTIONS = [
  'STATUS', 'PRIORITY', 'SOURCE', 'CAMPAIGN', 'ASSIGNED_TO', 'OWNER', 'COUNTRY', 'INDUSTRY',
  'CREATED_MONTH', 'LEAD_RECEIVED_MONTH',
] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BY_OPTIONS)[number];

export const REPORT_GROUP_BY_LABELS: Record<ReportGroupBy, string> = {
  STATUS: 'Status',
  PRIORITY: 'Priority',
  SOURCE: 'Source',
  CAMPAIGN: 'Campaign',
  ASSIGNED_TO: 'Assigned Rep',
  OWNER: 'Current Owner',
  COUNTRY: 'Country',
  INDUSTRY: 'Industry',
  CREATED_MONTH: 'Month Created',
  LEAD_RECEIVED_MONTH: 'Month Received',
};

export const REPORT_METRIC_OPTIONS = ['COUNT', 'SUM_DEAL_VALUE', 'AVG_DEAL_VALUE'] as const;
export type ReportMetric = (typeof REPORT_METRIC_OPTIONS)[number];

export const REPORT_METRIC_LABELS: Record<ReportMetric, string> = {
  COUNT: 'Lead Count',
  SUM_DEAL_VALUE: 'Total Deal Value',
  AVG_DEAL_VALUE: 'Average Deal Value',
};

export const REPORT_CHART_TYPE_OPTIONS = ['TABLE', 'BAR', 'PIE', 'LINE'] as const;
export type ReportChartType = (typeof REPORT_CHART_TYPE_OPTIONS)[number];

export interface ReportFilters {
  status?: string;
  priority?: string;
  source?: string;
  campaignId?: string;
  assignedToId?: string;
  ownerId?: string;
  dateField?: 'createdAt' | 'leadReceivedDate';
  dateFrom?: string;
  dateTo?: string;
  includeInactive?: boolean;
}

export interface ReportConfig {
  groupBy: ReportGroupBy;
  metric: ReportMetric;
  chartType: ReportChartType;
  filters: ReportFilters;
}

export interface CustomReportDefinition extends ReportConfig {
  id: string;
  organizationId: string;
  entityType: string;
  name: string;
  description: string | null;
  isShared: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRow {
  key: string;
  label: string;
  value: number;
}
export interface ReportResult {
  groupBy: ReportGroupBy;
  metric: ReportMetric;
  chartType: ReportChartType;
  rows: ReportRow[];
  totalValue: number;
}

export function useReportDefinitions(entityType: string = 'LEAD') {
  return useQuery({
    queryKey: ['customReports', entityType],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomReportDefinition[]>>('/custom-reports', { params: { entityType } });
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useReportDefinition(id?: string) {
  return useQuery({
    queryKey: ['customReports', 'detail', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomReportDefinition>>(`/custom-reports/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string; isShared?: boolean } & ReportConfig) => {
      const res = await api.post<ApiEnvelope<CustomReportDefinition>>('/custom-reports', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });
}

export function useUpdateReportDefinition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<{ name: string; description: string | null; isShared: boolean } & ReportConfig>) => {
      const res = await api.patch<ApiEnvelope<CustomReportDefinition>>(`/custom-reports/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });
}

export function useDeleteReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/custom-reports/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });
}

/** Ad-hoc "preview before saving" run — same config shape as a saved definition. */
export function useRunReportPreview() {
  return useMutation({
    mutationFn: async (config: ReportConfig) => {
      const res = await api.post<ApiEnvelope<ReportResult>>('/custom-reports/run', config);
      return res.data.data;
    },
  });
}

export function useRunSavedReport(id?: string) {
  return useQuery({
    queryKey: ['customReports', 'run', id],
    queryFn: async () => {
      const res = await api.post<ApiEnvelope<ReportResult>>(`/custom-reports/${id}/run`);
      return res.data.data;
    },
    enabled: !!id,
  });
}
