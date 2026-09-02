import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Target, Building2, Users, Megaphone, Activity, CalendarClock, ListChecks,
  FileText, BarChart3, UserCog, ShieldCheck, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: 'Leads', to: '/leads', icon: Target, permission: PERMISSIONS.LEADS_VIEW },
  { label: 'Accounts', to: '/companies', icon: Building2 },
  { label: 'Contacts', to: '/contacts', icon: Users },
  { label: 'Campaigns', to: '/campaigns', icon: Megaphone },
  { label: 'Meetings', to: '/meetings', icon: CalendarClock },
  { label: 'Tasks', to: '/tasks', icon: ListChecks },
  { label: 'Documents', to: '/documents', icon: FileText },
  { label: 'Activity Feed', to: '/activities', icon: Activity },
  { label: 'Reports', to: '/reports', icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
  { label: 'Users', to: '/users', icon: UserCog, roles: ['ADMIN'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: ShieldCheck, permission: PERMISSIONS.AUDIT_LOGS_VIEW },
  { label: 'Settings', to: '/settings', icon: Settings },
];

const SIDEBAR_WIDTH_EXPANDED = 'w-60';
const SIDEBAR_WIDTH_COLLAPSED = 'w-[72px]';

function navItemClass(isActive: boolean, collapsed: boolean) {
  return cn(
    'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
    isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  );
}

export function Sidebar() {
  const { hasPermission, hasRole } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.roles && !hasRole(...item.roles)) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        'nav-shell hidden shrink-0 flex-col overflow-hidden border-r border-border bg-card text-foreground transition-[width] duration-200 ease-in-out md:flex',
        sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
      )}
    >
      {/* Collapse/expand toggle — kept at the top of the side nav, above the menu items. */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-border/60 px-2',
          sidebarCollapsed ? 'justify-center' : 'justify-end'
        )}
      >
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
      </div>

      <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-3">
        {visibleItems.map((item) => {
          const linkEl = (
            <NavLink
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) => navItemClass(isActive, sidebarCollapsed)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );

          return (
            <Fragment key={item.to}>
              {sidebarCollapsed ? (
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                linkEl
              )}
            </Fragment>
          );
        })}
      </nav>
    </aside>
  );
}
