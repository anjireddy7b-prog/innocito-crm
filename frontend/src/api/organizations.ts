import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { AuthUser } from '@/store/authStore';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface SignupPayload {
  organizationName: string;
  slug?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// Mirrors auth.ts's loginRequest — Phase 2 signup deliberately returns the exact same session
// shape as login (accessToken + user), so the frontend can treat a successful signup exactly
// like a successful login, plus the newly-created organization itself.
export async function signupRequest(payload: SignupPayload) {
  const res = await api.post<ApiEnvelope<{ organization: OrganizationSummary; accessToken: string; user: AuthUser }>>(
    '/organizations/signup',
    payload
  );
  return res.data.data;
}

export function useMyOrganization() {
  return useQuery({
    queryKey: ['organizations', 'me'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<OrganizationSummary>>('/organizations/me');
      return res.data.data;
    },
  });
}

export function useUpdateMyOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; slug?: string }) => {
      const res = await api.patch<ApiEnvelope<OrganizationSummary>>('/organizations/me', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations', 'me'] }),
  });
}
