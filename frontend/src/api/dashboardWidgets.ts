import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { ReportChartType, ReportGroupBy, ReportMetric } from './reportBuilder';

// Phase 10 (reporting/dashboard builder), slice 2 — pinning a saved custom report onto the
// caller's own personal "My Dashboard" tab. There's no isShared/ownership model here (unlike
// reportBuilder.ts) — every widget is scoped to the caller alone, see
// backend/src/db/schema.ts's dashboardWidgets table comment.

export interface DashboardWidget {
  id: string;
  organizationId: string;
  userId: string;
  reportDefinitionId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  reportDefinition: {
    id: string;
    name: string;
    description: string | null;
    groupBy: ReportGroupBy;
    metric: ReportMetric;
    chartType: ReportChartType;
    isShared: boolean;
  };
}

const WIDGETS_KEY = ['dashboardWidgets'] as const;

export function useMyWidgets() {
  return useQuery({
    queryKey: WIDGETS_KEY,
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<DashboardWidget[]>>('/dashboard-widgets');
      return res.data.data;
    },
    staleTime: 15_000,
  });
}

export function usePinReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportDefinitionId: string) => {
      const res = await api.post<ApiEnvelope<DashboardWidget>>('/dashboard-widgets', { reportDefinitionId });
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WIDGETS_KEY }),
  });
}

export function useUnpinWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (widgetId: string) => {
      await api.delete(`/dashboard-widgets/${widgetId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WIDGETS_KEY }),
  });
}

/** Sends the full widget-id order back — see reorderWidgetsSchema's own comment for why. */
export function useReorderWidgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await api.patch<ApiEnvelope<DashboardWidget[]>>('/dashboard-widgets/reorder', { orderedIds });
      return res.data.data;
    },
    onSuccess: (data) => queryClient.setQueryData(WIDGETS_KEY, data),
  });
}
