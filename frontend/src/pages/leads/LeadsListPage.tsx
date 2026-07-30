import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download, Upload, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { LeadStatusBadge, PriorityBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads } from '@/api/leads';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatCurrency, formatDate } from '@/lib/utils';
import { downloadFile } from '@/lib/download';
import { apiErrorMessage } from '@/lib/api';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_PRIORITIES, type Lead } from '@/types';
import { LeadFormDialog } from '@/pages/leads/LeadFormDialog';
import { LeadImportDialog } from '@/pages/leads/LeadImportDialog';

export default function LeadsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile('/reports/leads/export.csv', 'leads-export.csv');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to export leads'));
    } finally {
      setExporting(false);
    }
  }

  const page = Number(params.get('page') ?? 1);
  const sortBy = params.get('sortBy') ?? 'createdAt';
  const sortDir = (params.get('sortDir') as 'asc' | 'desc') ?? 'desc';

  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: params.get('search') || undefined,
      status: params.get('status') || undefined,
      source: params.get('source') || undefined,
      priority: params.get('priority') || undefined,
      assignedToId: params.get('assignedToId') || undefined,
      sortBy,
      sortDir,
    }),
    [page, params, sortBy, sortDir]
  );

  const { data, isLoading } = useLeads(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Lead>[] = [
    { key: 'displayId', header: 'Lead ID', cell: (l) => <span className="font-mono text-xs font-medium">{l.displayId}</span> },
    {
      key: 'company',
      header: 'Company',
      cell: (l) => (
        <div>
          <p className="font-medium">{l.company?.name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{l.contact ? `${l.contact.firstName} ${l.contact.lastName}` : ''}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortable: true, cell: (l) => <LeadStatusBadge status={l.status} /> },
    { key: 'priority', header: 'Priority', sortable: true, cell: (l) => <PriorityBadge priority={l.priority} /> },
    { key: 'source', header: 'Source', cell: (l) => <span className="text-sm text-muted-foreground">{l.source.replace(/_/g, ' ')}</span> },
    { key: 'campaign', header: 'Campaign', cell: (l) => l.campaign?.name ?? '—' },
    {
      key: 'assignedTo',
      header: 'Assigned Rep',
      cell: (l) => (l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : <span className="text-muted-foreground">Unassigned</span>),
    },
    { key: 'dealValue', header: 'Deal Value', sortable: true, cell: (l) => formatCurrency(l.dealValue, l.currency) },
    { key: 'createdAt', header: 'Created', sortable: true, cell: (l) => formatDate(l.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description="Track and manage every inbound and outbound lead through the sales pipeline."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting}>
              <Download /> Export CSV
            </Button>
            {hasPermission(PERMISSIONS.LEADS_CREATE) && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload /> Import
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> New Lead
                </Button>
              </>
            )}
          </>
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
          <Input placeholder="Search leads…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <Select value={params.get('status') ?? '__all__'} onValueChange={(v) => updateParam('status', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.get('source') ?? '__all__'} onValueChange={(v) => updateParam('source', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {LEAD_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.get('priority') ?? '__all__'} onValueChange={(v) => updateParam('priority', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All priorities</SelectItem>
            {LEAD_PRIORITIES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(l) => l.id}
        onRowClick={(l) => navigate(`/leads/${l.id}`)}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(key) => {
          const next = new URLSearchParams(params);
          if (sortBy === key) next.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
          else {
            next.set('sortBy', key);
            next.set('sortDir', 'desc');
          }
          setParams(next);
        }}
        emptyTitle="No leads match your filters"
        emptyDescription="Try clearing filters or create a new lead to get started."
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

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
