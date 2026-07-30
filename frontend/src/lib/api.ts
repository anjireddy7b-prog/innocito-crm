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
