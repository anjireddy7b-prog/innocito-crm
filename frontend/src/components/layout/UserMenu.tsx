import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User as UserIcon, KeyRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { logoutRequest } from '@/api/auth';
import { initials } from '@/lib/utils';
import { toast } from 'sonner';

export function UserMenu() {
  const { user, clearSession } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    try {
      await logoutRequest();
    } finally {
      clearSession();
      toast.success('Signed out');
      navigate('/login');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar>
          <AvatarImage src={user.avatarUrl ?? undefined} />
          <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold text-foreground">{user.firstName} {user.lastName}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <UserIcon /> My Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/settings?tab=security')}>
          <KeyRound /> Change Password
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={handleLogout}>
          <LogOut /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
