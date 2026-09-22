import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 3: roles are tenant-scoped, admin-editable data (see the Architecture Report) — `name`
// is a plain string, not the old fixed RoleName union, since an organization can rename or create
// roles freely from here on.
export interface Role {
  id: string;
  name: string;
  description: string | null;
  createdAt?: string;
  updatedAt?: string;
  permissions: string[];
}

export interface Permission {
  key: string;
  description: string | null;
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

/** The fixed, global catalog of permission keys a role can be granted — powers the role editor's
 * permission checklist. Never tenant-scoped, unlike roles themselves. */
export function usePermissionsCatalog() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Permission[]>>('/permissions');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string | null; permissionKeys: string[] }) => {
      const res = await api.post<ApiEnvelope<Role>>('/roles', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; description?: string | null; permissionKeys?: string[] }) => {
      const res = await api.patch<ApiEnvelope<Role>>(`/roles/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/roles/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}
