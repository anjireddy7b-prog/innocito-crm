import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { RoleName } from '@/types';

export interface Role {
  id: string;
  name: RoleName;
  description: string | null;
  permissions: string[];
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Role[]>>('/roles');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}
