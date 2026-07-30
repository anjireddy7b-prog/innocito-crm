import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCompanies } from '@/api/companies';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import type { Company } from '@/types';
import { CompanyFormDialog } from '@/pages/companies/CompanyFormDialog';

export default function CompaniesListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({ page, pageSize: 20, search: params.get('search') || undefined }),
    [page, params]
  );
  const { data, isLoading } = useCompanies(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Company>[] = [
    {
      key: 'name',
      header: 'Company',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.domain ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'industry', header: 'Industry', cell: (c) => c.industry ?? '—' },
    { key: 'country', header: 'Country', cell: (c) => c.country ?? '—' },
    { key: 'companySize', header: 'Size', cell: (c) => c.companySize ?? '—' },
    { key: 'leads', header: 'Leads', cell: (c) => <Badge variant="outline">{c._count?.leads ?? 0}</Badge> },
    { key: 'contacts', header: 'Contacts', cell: (c) => <Badge variant="outline">{c._count?.contacts ?? 0}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Companies"
        description="Every organization your team has engaged with, consolidated from leads and contacts."
        actions={
          hasPermission(PERMISSIONS.COMPANIES_MANAGE) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Company
            </Button>
          )
        }
      />

      <form
        className="relative w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam('search', search || null);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search companies…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/companies/${c.id}`)}
        emptyTitle="No companies found"
        emptyDescription="Companies are created automatically from leads, or you can add one directly."
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

      <CompanyFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
