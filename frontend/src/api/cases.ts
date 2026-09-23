import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Case } from '@/types';

export function useCases(query: Record<string, unknown>) {
  return useQuery({
    queryKey: ['cases', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Case[]>>('/cases', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCase(id?: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Case>>(`/cases/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Case>>('/cases', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useUpdateCase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Case>>(`/cases/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}
