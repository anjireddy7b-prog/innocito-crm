import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { UserMenu } from '@/components/layout/UserMenu';

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <span className="hidden text-sm font-bold tracking-tight sm:inline">Innocito&nbsp;CRM</span>
      </Link>

      <div className="flex-1 px-2 sm:px-6">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}
