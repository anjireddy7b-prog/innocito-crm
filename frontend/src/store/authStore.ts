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
  // Phase 13 (super admin) — see backend/src/db/schema.ts's users.isPlatformAdmin comment.
  // Optional because it's a new field on an interface that's also populated straight from
  // whatever /auth/me or login returned before this phase existed; treat a missing value the
  // same as `false` everywhere this is read (see ProtectedRoute.tsx's RequirePlatformAdmin and
  // Sidebar.tsx's nav item gate below).
  isPlatformAdmin?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  // Phase 13 (super admin), slice 2 — user impersonation. `impersonationAdmin` holds the platform
  // admin's OWN {user, accessToken} while `user`/`accessToken` above are swapped to the
  // impersonated identity — never persisted anywhere beyond this in-memory store, and never both
  // things at once (it's null exactly when isImpersonating is false). See startImpersonation/
  // endImpersonation below and lib/api.ts's response interceptor, which reads isImpersonating to
  // decide how to handle a 401 while one of these sessions is active.
  isImpersonating: boolean;
  impersonationAdmin: { user: AuthUser; accessToken: string } | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthState['status']) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
  startImpersonation: (user: AuthUser, accessToken: string) => void;
  endImpersonation: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  isImpersonating: false,
  impersonationAdmin: null,
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authenticated' }),
  clearSession: () => set({ user: null, accessToken: null, status: 'unauthenticated', isImpersonating: false, impersonationAdmin: null }),
  setStatus: (status) => set({ status }),
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
  hasRole: (...roles) => (get().user ? roles.includes(get().user!.role) : false),
  startImpersonation: (user, accessToken) => {
    const current = get();
    // Guard against nesting: starting impersonation while already impersonating would otherwise
    // overwrite the ORIGINAL platform admin snapshot with the impersonated user's own state,
    // stranding the real admin identity with no way back. The console never offers a second
    // Impersonate action while already impersonating (see PlatformOrganizationsPage.tsx), but this
    // keeps the store itself safe regardless of how it's called.
    if (current.isImpersonating || !current.user || !current.accessToken) return;
    set({
      impersonationAdmin: { user: current.user, accessToken: current.accessToken },
      user,
      accessToken,
      isImpersonating: true,
    });
  },
  endImpersonation: () => {
    const admin = get().impersonationAdmin;
    if (!admin) {
      // No snapshot to restore (shouldn't happen in normal use) — the safest fallback is a full
      // logout rather than leaving the caller stuck in a half-impersonated state.
      set({ user: null, accessToken: null, status: 'unauthenticated', isImpersonating: false, impersonationAdmin: null });
      return;
    }
    set({ user: admin.user, accessToken: admin.accessToken, isImpersonating: false, impersonationAdmin: null, status: 'authenticated' });
  },
}));
