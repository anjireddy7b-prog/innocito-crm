import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the httpOnly refresh-token cookie
});

function getCsrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
    ?.split('=')[1];
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const csrf = getCsrfToken();
  if (csrf && config.method && !['get', 'head', 'options'].includes(config.method)) {
    config.headers['x-csrf-token'] = csrf;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post(
      '/api/auth/refresh',
      {},
      { withCredentials: true, headers: { 'x-csrf-token': getCsrfToken() ?? '' } }
    );
    const token = res.data?.data?.accessToken as string;
    return token ?? null;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
      if (newToken) {
        useAuthStore.setState((s) => ({ accessToken: newToken, status: 'authenticated', user: s.user }));

        // The access token rotates every ~15 minutes for as long as a tab stays open, but until
        // now this only swapped the token — the cached `user.permissions`/`role` stayed exactly
        // as they were at the tab's last full page load. A permission granted server-side (e.g.
        // an admin's default-role grants being backfilled, or a role edited in Settings) would
        // then never reach an already-open tab's nav/route guards, no matter how long it waited;
        // only a hard reload or logout/login re-ran useAuthBootstrap's own /auth/me fetch. Re-
        // fetching /auth/me here — which always re-queries the DB for the caller's current
        // permissions (see auth.service.ts's getCurrentUser/loadUserWithPermissions) — closes
        // that gap so a silent token refresh now keeps the whole cached user current, not just
        // the token. Plain `axios`, not the wrapped `api` instance, so this can't recurse back
        // into this same interceptor; failure here is non-fatal and simply keeps the old cached
        // user rather than failing the original request.
        try {
          const meRes = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${newToken}` } });
          const freshUser = meRes.data?.data;
          if (freshUser) useAuthStore.setState({ user: freshUser });
        } catch {
          // Non-fatal — see comment above.
        }

        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      useAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  }
);

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: { total: number; page: number; pageSize: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; [k: string]: unknown };
  details?: unknown;
}

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as any)?.message ?? err.message ?? fallback;
  }
  return fallback;
}
