import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 7 ("custom views/nav"): saved list-page filter/sort presets, scoped to entityType 'LEAD'
// for now — see backend/src/db/schema.ts's savedViews table comment. `filters` is stored and
// replayed as a plain string-to-string bag: it's exactly the shape LeadsListPage.tsx's own
// URLSearchParams-driven query state already is, so applying a view is just "set these params."
export interface SavedView {
  id: string;
  organizationId: string;
  entityType: string;
  name: string;
  isShared: boolean;
  createdById: string | null;
  filters: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export function useSavedViews(entityType: string = 'LEAD') {
  return useQuery({
    queryKey: ['savedViews', entityType],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<SavedView[]>>('/saved-views', { params: { entityType } });
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { entityType?: string; name: string; filters: Record<string, string>; isShared?: boolean }) => {
      const res = await api.post<ApiEnvelope<SavedView>>('/saved-views', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedViews'] }),
  });
}

export function useUpdateSavedView(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; filters?: Record<string, string>; isShared?: boolean }) => {
      const res = await api.patch<ApiEnvelope<SavedView>>(`/saved-views/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedViews'] }),
  });
}

export function useDeleteSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/saved-views/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedViews'] }),
  });
}
