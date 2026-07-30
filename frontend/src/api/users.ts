import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { AppUser, UserSummary } from '@/types';

export function useUsers(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['users', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<AppUser[]>>('/users', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useAssignableUsers(roles?: string[]) {
  return useQuery({
    queryKey: ['users', 'assignable', roles],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<UserSummary[]>>('/users/assignable', { params: roles ? { roles: roles.join(',') } : {} });
      return res.data.data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<{ user: AppUser; temporaryPassword: string }>>('/users', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<AppUser>>(`/users/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSetUserActive(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await api.patch<ApiEnvelope<AppUser>>(`/users/${id}/active`, { isActive });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetUserPassword(id: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiEnvelope<{ temporaryPassword: string }>>(`/users/${id}/reset-password`, {});
      return res.data.data;
    },
  });
}
