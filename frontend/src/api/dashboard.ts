import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { DashboardSummary } from '@/types';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<DashboardSummary>>('/dashboard/summary');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}
