import { Fragment, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Target, Building2, Users, Megaphone, Activity, CalendarClock, ListChecks,
  FileText, BarChart3, UserCog, ShieldCheck, KeyRound, Settings, ChevronLeft, ChevronRight,
  SlidersHorizontal, Box, GitMerge, LifeBuoy, BookOpen,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions';
import { useCustomObjectDefinitions } from '@/api/customObjects';
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
  // Phase 9: detection is open to any authenticated user (mirrors Accounts/Contacts above having
  // no permission gate either) — merging itself is gated per-entity-type on the page, on the same
  // COMPANIES_MANAGE/CONTACTS_MANAGE permission that already gates deleting that entity type.
  { label: 'Duplicates', to: '/duplicates', icon: GitMerge },
  { label: 'Campaigns', to: '/campaigns', icon: Megaphone },
  { label: 'Meetings', to: '/meetings', icon: CalendarClock },
  { label: 'Tasks', to: '/tasks', icon: ListChecks },
  // Phase 9 ("advanced CRM" slice) — case management. Ungated like Accounts/Contacts/Duplicates
  // above: viewing a case needs no permission, only creating/editing/deleting one does (see
  // CASES_MANAGE's own comment in lib/permissions.ts) — the nav item itself stays visible to
  // everyone so a caller without it can still see and comment on cases, just not manage them.
  { label: 'Cases', to: '/cases', icon: LifeBuoy },
  // Phase 9 ("advanced CRM" slice) — knowledge base. Ungated like Cases above: viewing published
  // articles needs no permission; only creating/editing/deleting one (and seeing drafts at all)
  // requires KNOWLEDGE_BASE_MANAGE — see that permission's own comment in lib/permissions.ts.
  { label: 'Knowledge Base', to: '/knowledge-base', icon: BookOpen },
  { label: 'Documents', to: '/documents', icon: FileText },
  { label: 'Activity Feed', to: '/activities', icon: Activity },
  { label: 'Reports', to: '/reports', icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
  // Phase 3: was a hardcoded roles: ['ADMIN'] gate — USERS_MANAGE is granted to ADMIN by default
  // (see backend/src/utils/permissions.ts), so this is a zero-behavior-change swap that also now
  // shows this item to any custom role granted the same permission.
  { label: 'Users', to: '/users', icon: UserCog, permission: PERMISSIONS.USERS_MANAGE },
  { label: 'Roles & Permissions', to: '/roles', icon: KeyRound, permission: PERMISSIONS.ROLES_VIEW },
  // Phase 4: same "gate on the broader of the two permissions this page covers" simplification
  // as CustomizationPage.tsx's route guard — see that file's comment.
  { label: 'Customization', to: '/customization', icon: SlidersHorizontal, permission: PERMISSIONS.CUSTOM_FIELDS_MANAGE },
  { label: 'Audit Logs', to: '/audit-logs', icon: ShieldCheck, permission: PERMISSIONS.AUDIT_LOGS_VIEW },
  { label: 'Settings', to: '/settings', icon: Settings },
];

const SIDEBAR_WIDTH_EXPANDED = 'w-60';
const SIDEBAR_WIDTH_COLLAPSED = 'w-[72px]';

function navItemClass(isActive: boolean, collapsed: boolean) {
  return cn(
    'flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-150 ease-apple',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
    isActive
      ? 'bg-primary/12 text-primary shadow-glass-sm'
      : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
  );
}

/**
 * Mirrors react-router's default (non-`end`) NavLink active-matching: exact match, or the
 * current path nested one level below `to` (segment-boundary aware, so e.g. "/leads-archive"
 * would NOT falsely match "/leads"). Computed manually — see the comment on `linkEl` below for why.
 */
function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Sidebar() {
  const { hasPermission, hasRole } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { pathname } = useLocation();

  // Phase 7 ("custom views/nav"): one nav item per organization's custom object definition
  // (Phase 5), gated on the exact same CUSTOM_OBJECTS_MANAGE permission every custom-objects
  // route already requires (see customObjects.routes.ts) — so this can never show, or link to, a
  // page the caller couldn't already reach by other means. `enabled` keeps the request from ever
  // firing for a caller who lacks it, rather than firing and getting a 403.
  const canManageCustomObjects = hasPermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE);
  const { data: customObjectDefinitions } = useCustomObjectDefinitions({ enabled: canManageCustomObjects });

  // Spliced in right after "Customization" in the underlying (unfiltered) NAV_ITEMS array, then
  // run through the exact same permission filter below — so ordering stays deterministic
  // regardless of which other items a given caller's role does or doesn't see.
  const items = useMemo(() => {
    if (!customObjectDefinitions?.length) return NAV_ITEMS;
    const dynamicItems: NavItem[] = customObjectDefinitions.map((def) => ({
      label: def.pluralLabel,
      to: `/objects/${def.id}`,
      icon: Box,
      permission: PERMISSIONS.CUSTOM_OBJECTS_MANAGE,
    }));
    const customizationIdx = NAV_ITEMS.findIndex((item) => item.to === '/customization');
    const insertAt = customizationIdx === -1 ? NAV_ITEMS.length : customizationIdx + 1;
    return [...NAV_ITEMS.slice(0, insertAt), ...dynamicItems, ...NAV_ITEMS.slice(insertAt)];
  }, [customObjectDefinitions]);

  const visibleItems = items.filter((item) => {
    if (item.roles && !hasRole(...item.roles)) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        'glass-chrome hidden shrink-0 flex-col overflow-hidden border-r border-border/60 bg-background text-foreground transition-[width] duration-200 ease-apple md:flex',
        sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
      )}
    >
      {/* Collapse/expand toggle — kept at the top of the side nav, above the menu items. */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-border/60 px-2',
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 ease-apple hover:bg-secondary/70 hover:text-foreground active:scale-90"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
      </div>

      <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {visibleItems.map((item) => {
          // className is computed as a plain string (not react-router's usual `({isActive}) =>
          // ...` render-prop form) and isActive is matched manually via `isPathActive` above.
          // When collapsed, this link renders inside a Radix <TooltipTrigger asChild>, which
          // clones the element and merges its props — including className. Radix's merge only
          // knows how to join strings; handed a function it doesn't call, it silently stringifies
          // the function itself into the class list, so NavLink falls back to just "<fn source>
          // active" and every bit of layout/active/hover styling on the link is lost. A plain
          // string sidesteps that merge bug entirely, in both the collapsed and expanded states.
          const isActive = isPathActive(pathname, item.to);
          const linkEl = (
            <NavLink to={item.to} aria-label={item.label} className={navItemClass(isActive, sidebarCollapsed)}>
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
