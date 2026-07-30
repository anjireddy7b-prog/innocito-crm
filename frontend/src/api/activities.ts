import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Activity } from '@/types';

export function useActivities(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['activities', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Activity[]>>('/activities', { params: query });
      return res.data.data;
    },
  });
}
