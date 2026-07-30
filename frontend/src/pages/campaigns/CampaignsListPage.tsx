import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCampaigns } from '@/api/campaigns';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import type { Campaign } from '@/types';
import { CampaignFormDialog } from '@/pages/campaigns/CampaignFormDialog';

const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ARCHIVED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

export default function CampaignsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({ page, pageSize: 20, search: params.get('search') || undefined, status: params.get('status') || undefined }),
    [page, params]
  );
  const { data, isLoading } = useCampaigns(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.code ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <Badge className={`border-transparent font-medium ${STATUS_STYLES[c.status] ?? ''}`}>{c.status}</Badge> },
    { key: 'startDate', header: 'Start', cell: (c) => formatDate(c.startDate) },
    { key: 'endDate', header: 'End', cell: (c) => formatDate(c.endDate) },
    { key: 'leads', header: 'Leads', cell: (c) => <Badge variant="outline">{c._count?.leads ?? 0}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        description="Marketing and outbound campaigns driving leads into your pipeline."
        actions={
          hasPermission(PERMISSIONS.CAMPAIGNS_MANAGE) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Campaign
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            updateParam('search', search || null);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search campaigns…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <Select value={params.get('status') ?? '__all__'} onValueChange={(v) => updateParam('status', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {CAMPAIGN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/campaigns/${c.id}`)}
        emptyTitle="No campaigns found"
        emptyDescription="Create a campaign to start tracking its lead performance."
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

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
