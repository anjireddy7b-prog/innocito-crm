import { Link } from 'react-router-dom';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { UserMenu } from '@/components/layout/UserMenu';
import innocitoLogo from '@/assets/innocito-logo.png';

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <Link to="/dashboard" className="flex shrink-0 items-center">
        <img src={innocitoLogo} alt="Innocito" className="h-7 w-auto" />
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
