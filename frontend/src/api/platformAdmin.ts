import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { AuthUser } from '@/store/authStore';

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
  // Phase 13 (super admin), slice 2 — used only to hide the Impersonate action on a platform
  // admin's own row (see PlatformOrganizationsPage.tsx); the backend independently re-checks this
  // regardless of what the UI shows (platformAdmin.service.ts's impersonateUser).
  isPlatformAdmin: boolean;
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

// Phase 13 (super admin), slice 2 — user impersonation. Returns the impersonated user's own
// {accessToken, user}, same shape loginRequest returns — the caller (PlatformOrganizationsPage)
// hands both straight to authStore's startImpersonation.
export function useImpersonateUser() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<ApiEnvelope<{ accessToken: string; user: AuthUser }>>(`/platform-admin/users/${userId}/impersonate`, {});
      return res.data.data;
    },
  });
}

// Phase 13 (super admin), slice 3 — platform-wide metrics.
export interface PlatformMetrics {
  totals: {
    organizations: number;
    activeOrganizations: number;
    suspendedOrganizations: number;
    users: number;
    leads: number;
  };
  organizationsByPlan: { planId: string; planName: string; count: number }[];
  signupTrend: { month: string; count: number }[];
}

export function usePlatformMetrics() {
  return useQuery({
    queryKey: ['platformAdmin', 'metrics'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PlatformMetrics>>('/platform-admin/metrics');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}
