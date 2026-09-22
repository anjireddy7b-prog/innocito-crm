import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 4: tenant-scoped, admin-editable metadata mirroring today's hardcoded lead_status enum
// (see the Architecture Report's Phase 4 completion section). `leads.status` itself is NOT yet
// driven by this table — this only powers a Pipeline Stages settings screen for
// renaming/reordering/toggling flags. Create/delete of brand-new stages is out of scope.
export interface PipelineStage {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
  isTerminal: boolean;
  createdAt: string;
  updatedAt: string;
}

export function usePipelineStages() {
  return useQuery({
    queryKey: ['pipelineStages'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PipelineStage[]>>('/pipeline-stages');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdatePipelineStage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { label?: string; sortOrder?: number; isWon?: boolean; isLost?: boolean; isTerminal?: boolean }) => {
      const res = await api.patch<ApiEnvelope<PipelineStage>>(`/pipeline-stages/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelineStages'] }),
  });
}
