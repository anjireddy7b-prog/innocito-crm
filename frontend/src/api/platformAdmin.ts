import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 13 (super admin), slice 1 — organization management console. Mirrors backend/src/modules/
// platformAdmin/* exactly: /platform-admin/organizations (list, with usage/plan enrichment per
// row), /platform-admin/organizations/:id (detail, including the member list), and the
// suspend/reactivate PATCH. Every request here 403s server-side for anyone whose token doesn't
// carry isPlatformAdmin — see backend/src/middleware/auth.ts's requirePlatformAdmin — so there's
// no separate "can I even call this" check needed client-side beyond gating the page/nav (see
// ProtectedRoute.tsx's RequirePlatformAdmin and Sidebar.tsx).

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  leadCount: number;
  plan: { id: string; name: string };
  subscriptionStatus: string;
}

export interface PlatformOrganizationMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { name: string } | null;
}

export interface PlatformOrganizationDetail extends PlatformOrganizationSummary {
  users: PlatformOrganizationMember[];
}

export function usePlatformOrganizations(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['platformAdmin', 'organizations', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PlatformOrganizationSummary[]>>('/platform-admin/organizations', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function usePlatformOrganizationDetail(id: string | null) {
  return useQuery({
    queryKey: ['platformAdmin', 'organizations', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PlatformOrganizationDetail>>(`/platform-admin/organizations/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

// Takes { id, isActive } per call rather than binding one org id at hook-construction time (mirrors
// UsersPage.tsx's own setActive mutation) — so a single instance of this hook, held once at the
// top of the page, can suspend/reactivate whichever row's toggle the caller just touched.
export function useSetPlatformOrganizationActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await api.patch<ApiEnvelope<PlatformOrganizationSummary>>(`/platform-admin/organizations/${id}/active`, { isActive });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platformAdmin', 'organizations'] }),
  });
}
