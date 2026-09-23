import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { CaseComment } from '@/types';

// Mirrors api/comments.ts (leads' own comment thread) exactly, scoped to /case-comments — see
// backend/src/modules/caseComments/caseComments.service.ts for why this is a sibling module
// rather than a generalized /comments.
export function useCaseComments(caseId?: string) {
  return useQuery({
    queryKey: ['caseComments', caseId],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CaseComment[]>>('/case-comments', { params: { caseId } });
      return res.data.data;
    },
    enabled: !!caseId,
  });
}

export function useCreateCaseComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { caseId: string; body: string }) => {
      const res = await api.post<ApiEnvelope<CaseComment>>('/case-comments', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caseComments'] }),
  });
}

export function useDeleteCaseComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/case-comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caseComments'] }),
  });
}
