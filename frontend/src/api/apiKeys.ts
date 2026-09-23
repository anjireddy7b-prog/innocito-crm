import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 11 (API/integrations), slice 1. Keys are immutable once created (see
// backend/src/modules/apiKeys/apiKeys.service.ts) — there is no update hook here, only
// create/list/revoke.

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  createdById: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Only present on the response to a successful create — the one moment the full secret exists
 * anywhere outside the caller's own clipboard. Never returned by list. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ApiKey[]>>('/api-keys');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; permissionKeys: string[] }) => {
      const res = await api.post<ApiEnvelope<CreatedApiKey>>('/api-keys', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api-keys/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}
