import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useContacts } from '@/api/contacts';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { initials } from '@/lib/utils';
import type { Contact } from '@/types';
import { ContactFormDialog } from '@/pages/contacts/ContactFormDialog';

export default function ContactsListPage() {
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
  const { data, isLoading } = useContacts(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<Contact>[] = [
    {
      key: 'name',
      header: 'Contact',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials(c.firstName, c.lastName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{c.firstName} {c.lastName} {c.isPrimary && <Badge variant="outline" className="ml-1 text-[10px]">Primary</Badge>}</p>
            <p className="text-xs text-muted-foreground">{c.designation ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'company', header: 'Company', cell: (c) => c.company?.name ?? '—' },
    { key: 'email', header: 'Email', cell: (c) => c.email ?? '—' },
    { key: 'phone', header: 'Phone', cell: (c) => c.phone ?? '—' },
    { key: 'country', header: 'Country', cell: (c) => c.country ?? '—' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contacts"
        description="Individual people tied to companies and leads across your pipeline."
        actions={
          hasPermission(PERMISSIONS.CONTACTS_MANAGE) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Contact
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
        <Input placeholder="Search contacts…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/contacts/${c.id}`)}
        emptyTitle="No contacts found"
        emptyDescription="Contacts are created automatically from leads, or you can add one directly."
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

      <ContactFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
