import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Campaign } from '@/types';

export function useCampaigns(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['campaigns', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Campaign[]>>('/campaigns', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCampaign(id?: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Campaign>>(`/campaigns/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Campaign>>('/campaigns', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Campaign>>(`/campaigns/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
