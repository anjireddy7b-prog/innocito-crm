import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { DashboardSummary } from '@/types';
import type { PeriodFilterValue } from '@/components/shared/PeriodFilter';

export function useDashboardSummary(period?: PeriodFilterValue) {
  const params = period && period.period !== 'all' ? period : undefined;
  return useQuery({
    queryKey: ['dashboard', 'summary', params ?? 'all'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<DashboardSummary>>('/dashboard/summary', { params });
      return res.data.data;
    },
    staleTime: 60_000,
  });
}
