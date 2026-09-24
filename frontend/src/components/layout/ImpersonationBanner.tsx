import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { endImpersonationRequest } from '@/api/auth';

// Phase 13 (super admin), slice 2 — user impersonation. Rendered unconditionally in AppLayout;
// returns null the vast majority of the time (isImpersonating is false for every ordinary
// session) and only ever shows once a platform admin has actually started impersonating someone
// (see PlatformOrganizationsPage.tsx's Impersonate action). This is deliberately impossible to
// dismiss without actually ending the session — there is no "hide" affordance, only "Exit" — so a
// platform admin can never lose track of which identity they're currently acting as.
export function ImpersonationBanner() {
  const { isImpersonating, user } = useAuthStore();
  const endImpersonation = useAuthStore((s) => s.endImpersonation);
  const navigate = useNavigate();

  if (!isImpersonating || !user) return null;

  async function handleExit() {
    try {
      await endImpersonationRequest();
    } catch {
      // Non-fatal — see endImpersonationRequest's own comment. The local session restore below
      // still happens regardless.
    }
    endImpersonation();
    toast.success('Exited impersonation');
    navigate('/platform-admin/organizations');
  }

  return (
    <div className="flex h-10 shrink-0 items-center justify-center gap-2 bg-warning px-4 text-sm font-medium text-warning-foreground">
      <Eye className="h-4 w-4" />
      <span>
        Viewing as {user.firstName} {user.lastName} ({user.email})
      </span>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-warning-foreground hover:bg-black/10" onClick={handleExit}>
        <LogOut className="h-3.5 w-3.5" />
        Exit impersonation
      </Button>
    </div>
  );
}
