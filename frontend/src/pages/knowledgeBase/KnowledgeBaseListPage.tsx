import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArticleStatusBadge } from '@/components/shared/StatusBadge';
import { useKnowledgeArticles } from '@/api/knowledgeBase';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatRelativeTime } from '@/lib/utils';
import type { KnowledgeArticle, ArticleStatus } from '@/types';
import { KnowledgeArticleFormDialog } from '@/pages/knowledgeBase/KnowledgeArticleFormDialog';

// Same curated-but-freeform list as KnowledgeArticleFormDialog.tsx (duplicated locally rather than
// imported, matching CasesListPage.tsx's own local STATUS_OPTIONS/PRIORITY_OPTIONS precedent).
const CATEGORY_OPTIONS = ['Product', 'Onboarding', 'Billing', 'Technical', 'Account Management', 'Policy', 'Other'];
const STATUS_OPTIONS: ArticleStatus[] = ['DRAFT', 'PUBLISHED'];

export default function KnowledgeBaseListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: params.get('search') || undefined,
      category: params.get('category') || undefined,
      // Only a manager's own filter choice is sent — a non-manager's request is forced to
      // PUBLISHED-only server-side regardless of this param (see knowledgeBase.service.ts's
      // listArticles), so the status filter UI itself is also hidden from them below.
      status: canManage ? params.get('status') || undefined : undefined,
    }),
    [page, params, canManage]
  );
  const { data, isLoading } = useKnowledgeArticles(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<KnowledgeArticle>[] = [
    {
      key: 'title',
      header: 'Article',
      cell: (a) => (
        <div>
          <p className="font-medium">{a.title}</p>
          {a.tags.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{a.tags.join(', ')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (a) => (a.category ? <Badge variant="outline">{a.category}</Badge> : <span className="text-muted-foreground">—</span>),
    },
    ...(canManage ? [{ key: 'status', header: 'Status', cell: (a: KnowledgeArticle) => <ArticleStatusBadge status={a.status} /> } as DataTableColumn<KnowledgeArticle>] : []),
    { key: 'createdBy', header: 'Author', cell: (a) => (a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : '—') },
    { key: 'updatedAt', header: 'Updated', cell: (a) => formatRelativeTime(a.updatedAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Knowledge Base"
        description="Internal reference articles for the team."
        actions={
          canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Article
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
          <Input placeholder="Search articles…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <Select value={params.get('category') ?? '__all__'} onValueChange={(v) => updateParam('category', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {canManage && (
          <Select value={params.get('status') ?? '__all__'} onValueChange={(v) => updateParam('status', v === '__all__' ? null : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === 'DRAFT' ? 'Draft' : 'Published'}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(a) => a.id}
        onRowClick={(a) => navigate(`/knowledge-base/${a.id}`)}
        emptyTitle="No articles found"
        emptyDescription={canManage ? 'Write your first knowledge base article to get started.' : 'Published articles will show up here.'}
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

      <KnowledgeArticleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
