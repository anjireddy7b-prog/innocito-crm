import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaseStatusBadge, CasePriorityBadge } from '@/components/shared/StatusBadge';
import { useCases } from '@/api/cases';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatRelativeTime } from '@/lib/utils';
import type { Case, CaseStatus, CasePriority } from '@/types';
import { CaseFormDialog } from '@/pages/cases/CaseFormDialog';

const STATUS_OPTIONS: CaseStatus[] = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS: CasePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function CasesListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: params.get('search') || undefined,
      status: params.get('status') || undefined,
      priority: params.get('priority') || undefined,
    }),
    [page, params]
  );
  const { data, isLoading } = useCases(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Case>[] = [
    {
      key: 'subject',
      header: 'Case',
      cell: (c) => (
        <div>
          <p className="font-mono text-xs text-muted-foreground">{c.displayId}</p>
          <p className="font-medium">{c.subject}</p>
          <p className="text-xs text-muted-foreground">{c.company?.name ?? (c.contact ? `${c.contact.firstName} ${c.contact.lastName}` : '—')}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <CaseStatusBadge status={c.status} /> },
    { key: 'priority', header: 'Priority', cell: (c) => <CasePriorityBadge priority={c.priority} /> },
    { key: 'assignedTo', header: 'Assigned To', cell: (c) => (c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : 'Unassigned') },
    { key: 'createdAt', header: 'Opened', cell: (c) => formatRelativeTime(c.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cases"
        description="Support and service issues, optionally linked to a company or contact."
        actions={
          hasPermission(PERMISSIONS.CASES_MANAGE) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Case
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
          <Input placeholder="Search cases…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <Select value={params.get('status') ?? '__all__'} onValueChange={(v) => updateParam('status', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={params.get('priority') ?? '__all__'} onValueChange={(v) => updateParam('priority', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/cases/${c.id}`)}
        emptyTitle="No cases found"
        emptyDescription="Support and service issues you open will show up here."
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

      <CaseFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
