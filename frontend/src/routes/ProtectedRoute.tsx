import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const hasPermission = useAuthStore((s) => s.hasPermission(permission));
  if (!hasPermission) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const hasRole = useAuthStore((s) => s.hasRole(...roles));
  if (!hasRole) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
