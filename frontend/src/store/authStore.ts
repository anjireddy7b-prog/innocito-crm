import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthState['status']) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authenticated' }),
  clearSession: () => set({ user: null, accessToken: null, status: 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
  hasRole: (...roles) => (get().user ? roles.includes(get().user!.role) : false),
}));
