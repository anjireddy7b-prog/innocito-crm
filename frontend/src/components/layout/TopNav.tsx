import { Link } from 'react-router-dom';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { UserMenu } from '@/components/layout/UserMenu';
import sdrReachOutLogo from '@/assets/sdr-reachout-logo.png';

export function TopNav() {
  return (
    <header className="glass-chrome sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b border-border/60 bg-background px-5 text-foreground">
      {/* The nav is a light glass surface now, so the logo's navy wordmark reads fine directly —
          no chip needed to rescue it from a dark background the way the old dark chrome required. */}
      <Link to="/dashboard" className="flex shrink-0 items-center transition-transform duration-150 ease-apple hover:scale-[1.02]">
        <img src={sdrReachOutLogo} alt="SDR ReachOut" className="h-7 w-auto" />
      </Link>

      <div className="flex-1 px-2 sm:px-6">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}
