import { api, ApiEnvelope } from '@/lib/api';
import type { AuthUser } from '@/store/authStore';

export async function loginRequest(email: string, password: string) {
  const res = await api.post<ApiEnvelope<{ accessToken: string; user: AuthUser }>>('/auth/login', { email, password });
  return res.data.data;
}

export async function refreshRequest() {
  const res = await api.post<ApiEnvelope<{ accessToken: string }>>('/auth/refresh');
  return res.data.data;
}

export async function logoutRequest() {
  await api.post('/auth/logout');
}

export async function meRequest() {
  const res = await api.get<ApiEnvelope<AuthUser>>('/auth/me');
  return res.data.data;
}

export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  const res = await api.post<ApiEnvelope<null>>('/auth/change-password', { currentPassword, newPassword });
  return res.data;
}

// Phase 15 (security hardening) — session/device management. Mirrors backend/src/modules/auth/
// auth.service.ts's listSessions/revokeSession/revokeOtherSessions exactly: every one of these is
// scoped server-side to the caller's own userId (see that file's own comments), so there's no
// separate permission to check here the way api/apiKeys.ts or api/webhooks.ts would — any signed-
// in user can see and manage their own sessions, same as changePasswordRequest above.
export interface AuthSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  // The session backing whichever request just fetched this list — i.e. "this browser, right
  // now," not "the most recently created session." See SessionsCard's own comment for why that
  // distinction matters for the revoke-others button.
  current: boolean;
}

export async function listSessionsRequest() {
  const res = await api.get<ApiEnvelope<AuthSession[]>>('/auth/sessions');
  return res.data.data;
}

export async function revokeSessionRequest(id: string) {
  await api.delete(`/auth/sessions/${id}`);
}

export async function revokeOtherSessionsRequest() {
  const res = await api.post<ApiEnvelope<{ revokedCount: number }>>('/auth/sessions/revoke-others');
  return res.data.data;
}

// Phase 13 (super admin), slice 2. Purely for the audit trail (see
// backend/src/modules/auth/auth.service.ts's endImpersonation) — the client already restores the
// platform admin's own session locally via authStore's endImpersonation regardless of whether
// this call succeeds, so it's fired-and-awaited but never blocks or gates that restore.
export async function endImpersonationRequest() {
  await api.post('/auth/end-impersonation');
}
