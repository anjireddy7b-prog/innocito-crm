import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Contact } from '@/types';

export function useContacts(query: Record<string, unknown>) {
  return useQuery({
    queryKey: ['contacts', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Contact[]>>('/contacts', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useContact(id?: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Contact>>(`/contacts/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Contact>>('/contacts', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Contact>>(`/contacts/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
