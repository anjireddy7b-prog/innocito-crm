import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Target, Building2, Users, Megaphone, Activity, CalendarClock, ListChecks,
  FileText, BarChart3, UserCog, ShieldCheck, Settings,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions';

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
  { label: 'Companies', to: '/companies', icon: Building2 },
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

export function Sidebar() {
  const { hasPermission, hasRole } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.roles && !hasRole(...item.roles)) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
