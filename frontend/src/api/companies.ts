import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Company } from '@/types';

export function useCompanies(query: Record<string, unknown>) {
  return useQuery({
    queryKey: ['companies', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Company[]>>('/companies', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCompany(id?: string) {
  return useQuery({
    queryKey: ['companies', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Company>>(`/companies/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Company>>('/companies', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}

export function useUpdateCompany(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Company>>(`/companies/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/companies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}
