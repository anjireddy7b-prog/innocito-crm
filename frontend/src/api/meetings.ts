import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Meeting } from '@/types';

export function useMeetings(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['meetings', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Meeting[]>>('/meetings', { params: query });
      return res.data.data;
    },
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Meeting>>('/meetings', payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Meeting>>(`/meetings/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/meetings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  });
}
