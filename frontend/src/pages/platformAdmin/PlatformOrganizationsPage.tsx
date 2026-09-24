import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, UserRoundCheck, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { apiErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime, humanizeEnum } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import {
  usePlatformOrganizations,
  usePlatformOrganizationDetail,
  useSetPlatformOrganizationActive,
  useImpersonateUser,
  PlatformOrganizationSummary,
  PlatformOrganizationMember,
} from '@/api/platformAdmin';

// Phase 13 (super admin), slice 1. Only reachable by a caller with isPlatformAdmin — see
// ProtectedRoute.tsx's RequirePlatformAdmin, which wraps this page's route in App.tsx — so
// everything below can assume that's already true and just render the console itself.

export default function PlatformOrganizationsPage() {
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<PlatformOrganizationSummary | null>(null);

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({
      page,
      pageSize: 25,
      search: params.get('search') || undefined,
      isActive: params.get('isActive') ? params.get('isActive') === 'true' : undefined,
    }),
    [page, params]
  );
  const { data, isLoading } = usePlatformOrganizations(query);
  const setActive = useSetPlatformOrganizationActive();

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  function reactivate(org: PlatformOrganizationSummary) {
    setActive.mutate(
      { id: org.id, isActive: true },
      {
        onSuccess: () => toast.success(`${org.name} reactivated`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to reactivate organization')),
      }
    );
  }

  const columns: DataTableColumn<PlatformOrganizationSummary>[] = [
    {
      key: 'name',
      header: 'Organization',
      cell: (o) => (
        <div>
          <p className="font-medium">{o.name}</p>
          <p className="text-xs text-muted-foreground">{o.slug}</p>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', cell: (o) => <Badge variant="outline">{o.plan.name}</Badge> },
    { key: 'users', header: 'Users', cell: (o) => o.userCount },
    { key: 'leads', header: 'Leads', cell: (o) => o.leadCount },
    { key: 'subscriptionStatus', header: 'Subscription', cell: (o) => humanizeEnum(o.subscriptionStatus) },
    { key: 'createdAt', header: 'Created', cell: (o) => formatDate(o.createdAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={o.isActive}
            onCheckedChange={(checked) => {
              // Reactivating has no downside for members, so it's a direct action; suspending
              // goes through the confirm dialog below since it immediately locks out real users.
              if (checked) reactivate(o);
              else setSuspendTarget(o);
            }}
          />
          <span className="text-xs text-muted-foreground">{o.isActive ? 'Active' : 'Suspended'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (o) => (
        <Button variant="ghost" size="icon" onClick={() => setDetailOrgId(o.id)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform Admin"
        description="Every organization on this platform, across every tenant. Suspending an organization immediately blocks its members from logging in."
        actions={
          <Button variant="outline" asChild>
            <Link to="/platform-admin/metrics">
              <BarChart3 /> Metrics
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or slug…"
          className="w-64"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && updateParam('search', searchInput || null)}
        />
        <Select
          value={params.get('isActive') ?? '__all__'}
          onValueChange={(v) => updateParam('isActive', v === '__all__' ? null : v)}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(o) => o.id}
        emptyTitle="No organizations found"
      />

      {data?.meta && (
        <Pagination
          page={data.meta.page}
          pageSize={data.meta.pageSize}
          total={data.meta.total}
          totalPages={data.meta.totalPages}
          onPageChange={(p) => updateParam('page', String(p))}
        />
      )}

      <OrganizationDetailDialog orgId={detailOrgId} onOpenChange={(o) => !o && setDetailOrgId(null)} />

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.name}?`}
        description="Every member of this organization will be immediately blocked from logging in, with a clear message telling them to contact support. This does not delete any data, and can be reversed at any time."
        destructive
        confirmLabel="Suspend Organization"
        loading={setActive.isPending}
        onConfirm={() => {
          if (!suspendTarget) return;
          const org = suspendTarget;
          setActive.mutate(
            { id: org.id, isActive: false },
            {
              onSuccess: () => toast.success(`${org.name} suspended`),
              onError: (err) => toast.error(apiErrorMessage(err, 'Failed to suspend organization')),
            }
          );
          setSuspendTarget(null);
        }}
      />
    </div>
  );
}

function OrganizationDetailDialog({ orgId, onOpenChange }: { orgId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: org, isLoading } = usePlatformOrganizationDetail(orgId);
  const impersonate = useImpersonateUser();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const navigate = useNavigate();
  const [impersonateTarget, setImpersonateTarget] = useState<PlatformOrganizationMember | null>(null);

  function confirmImpersonate() {
    if (!impersonateTarget) return;
    const target = impersonateTarget;
    impersonate.mutate(target.id, {
      onSuccess: (result) => {
        startImpersonation(result.user, result.accessToken);
        setImpersonateTarget(null);
        onOpenChange(false);
        toast.success(`Now viewing as ${target.firstName} ${target.lastName}`);
        navigate('/dashboard');
      },
      onError: (err) => {
        toast.error(apiErrorMessage(err, 'Failed to start impersonation'));
        setImpersonateTarget(null);
      },
    });
  }

  return (
    <>
      <Dialog open={!!orgId} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{org?.name ?? 'Organization'}</DialogTitle>
            <DialogDescription>
              {org ? `${org.slug} · ${org.plan.name} plan · ${humanizeEnum(org.subscriptionStatus)} · created ${formatDate(org.createdAt)}` : 'Loading…'}
            </DialogDescription>
          </DialogHeader>

          {!isLoading && org && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{org.userCount} users</span>
                <span>{org.leadCount} leads</span>
                <Badge variant={org.isActive ? 'outline' : 'destructive'}>{org.isActive ? 'Active' : 'Suspended'}</Badge>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Last Login</th>
                      <th className="px-3 py-2">Active</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {org.users.map((u) => (
                      <tr key={u.id} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <p className="font-medium">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="px-3 py-2">{u.role ? humanizeEnum(u.role.name) : '—'}</td>
                        <td className="px-3 py-2">{formatDateTime(u.lastLoginAt)}</td>
                        <td className="px-3 py-2">{u.isActive ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 text-right">
                          {/* Phase 13 (super admin), slice 2. Hidden for a disabled or platform-admin
                              row — the backend independently re-checks both regardless (see
                              platformAdmin.service.ts's impersonateUser), this just avoids offering an
                              action that would only come back as an error. */}
                          {u.isActive && !u.isPlatformAdmin && (
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setImpersonateTarget(u)}>
                              <UserRoundCheck className="h-3.5 w-3.5" /> Impersonate
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!impersonateTarget}
        onOpenChange={(o) => !o && setImpersonateTarget(null)}
        title={`Impersonate ${impersonateTarget?.firstName} ${impersonateTarget?.lastName}?`}
        description="You'll see the app exactly as this user does, with their own permissions — for support and debugging. This is logged and expires automatically after 30 minutes; you can also exit anytime via the banner at the top of the screen."
        confirmLabel="Start Impersonating"
        loading={impersonate.isPending}
        onConfirm={confirmImpersonate}
      />
    </>
  );
}
