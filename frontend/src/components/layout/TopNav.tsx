import { Link } from 'react-router-dom';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { UserMenu } from '@/components/layout/UserMenu';
import sdrReachOutLogo from '@/assets/sdr-reachout-logo.png';

export function TopNav() {
  return (
    <header className="nav-shell sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4 text-foreground">
      {/*
        The "SDR" half of the wordmark is dark navy in the source artwork, so it disappears
        against the dark nav-shell chrome — a small white chip keeps the full lockup legible
        without recoloring the brand asset itself.
      */}
      <Link to="/dashboard" className="flex shrink-0 items-center rounded-md bg-white px-2 py-1">
        <img src={sdrReachOutLogo} alt="SDR ReachOut" className="h-6 w-auto" />
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
