import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Document } from '@/types';

export function useDocuments(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['documents', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Document[]>>('/documents', { params: query });
      return res.data.data;
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, leadId, companyId, documentType }: { file: File; leadId?: string; companyId?: string; documentType?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (leadId) form.append('leadId', leadId);
      if (companyId) form.append('companyId', companyId);
      if (documentType) form.append('documentType', documentType);
      const res = await api.post<ApiEnvelope<Document>>('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}
