import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SequenceStatusBadge } from '@/components/shared/StatusBadge';
import { useSequences } from '@/api/sequences';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatRelativeTime } from '@/lib/utils';
import type { Sequence, SequenceStatus } from '@/types';
import { SequenceFormDialog } from '@/pages/sequences/SequenceFormDialog';

const STATUS_OPTIONS: SequenceStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Mirrors CasesListPage.tsx's structure.
// Unlike Cases/Knowledge Base's list pages, this whole page is already gated behind
// SEQUENCES_MANAGE at the route level (App.tsx) — see that permission's own comment — so, unlike
// those pages, there's no separate "viewing needs nothing, only the New button needs the
// permission" split here: anyone who can reach this page can also create.
export default function SequencesListPage() {
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
    }),
    [page, params]
  );
  const { data, isLoading } = useSequences(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Sequence>[] = [
    {
      key: 'name',
      header: 'Sequence',
      cell: (s) => (
        <div>
          <p className="font-medium">{s.name}</p>
          {s.description && <p className="max-w-md truncate text-xs text-muted-foreground">{s.description}</p>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (s) => <SequenceStatusBadge status={s.status} /> },
    { key: 'stepCount', header: 'Steps', cell: (s) => s.stepCount ?? 0 },
    { key: 'activeEnrollmentCount', header: 'Active Enrollments', cell: (s) => s.activeEnrollmentCount ?? 0 },
    { key: 'updatedAt', header: 'Last Updated', cell: (s) => formatRelativeTime(s.updatedAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sequences"
        description="Multi-step outreach cadences your reps can manually enroll leads into."
        actions={
          hasPermission(PERMISSIONS.SEQUENCES_MANAGE) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Sequence
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
          <Input placeholder="Search sequences…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <Select value={params.get('status') ?? '__all__'} onValueChange={(v) => updateParam('status', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/sequences/${s.id}`)}
        emptyTitle="No sequences found"
        emptyDescription="Sequences you create will show up here."
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

      <SequenceFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
