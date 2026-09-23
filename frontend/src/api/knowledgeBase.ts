import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { KnowledgeArticle } from '@/types';

export function useKnowledgeArticles(query: Record<string, unknown>) {
  return useQuery({
    queryKey: ['knowledgeArticles', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<KnowledgeArticle[]>>('/knowledge-base', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useKnowledgeArticle(id?: string) {
  return useQuery({
    queryKey: ['knowledgeArticles', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<KnowledgeArticle>>(`/knowledge-base/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<KnowledgeArticle>>('/knowledge-base', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledgeArticles'] }),
  });
}

export function useUpdateKnowledgeArticle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<KnowledgeArticle>>(`/knowledge-base/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledgeArticles'] }),
  });
}

export function useDeleteKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/knowledge-base/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledgeArticles'] }),
  });
}
