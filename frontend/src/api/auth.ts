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
