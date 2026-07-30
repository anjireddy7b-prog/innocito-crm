import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Comment } from '@/types';

export function useComments(leadId?: string) {
  return useQuery({
    queryKey: ['comments', leadId],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Comment[]>>('/comments', { params: { leadId } });
      return res.data.data;
    },
    enabled: !!leadId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { leadId: string; body: string }) => {
      const res = await api.post<ApiEnvelope<Comment>>('/comments', payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });
}
