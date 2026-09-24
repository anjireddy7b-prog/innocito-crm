import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 15 (security hardening). Mirrors backend/src/modules/ipAllowlist/* — CRUD for an org's
// allowed IPv4/CIDR ranges. Zero entries means unrestricted (see backend/src/utils/ipAllowlist.ts);
// this module never shows that as anything other than an empty list, matching the backend's own
// framing.

export interface IpAllowlistEntry {
  id: string;
  organizationId: string;
  cidr: string;
  label: string | null;
  createdById: string | null;
  createdAt: string;
}

export function useIpAllowlistEntries() {
  return useQuery({
    queryKey: ['ipAllowlist'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<IpAllowlistEntry[]>>('/ip-allowlist');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateIpAllowlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { cidr: string; label?: string }) => {
      const res = await api.post<ApiEnvelope<IpAllowlistEntry>>('/ip-allowlist', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ipAllowlist'] }),
  });
}

export function useDeleteIpAllowlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ip-allowlist/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ipAllowlist'] }),
  });
}
