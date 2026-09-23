import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ArticleStatusBadge } from '@/components/shared/StatusBadge';
import { useKnowledgeArticle, useDeleteKnowledgeArticle } from '@/api/knowledgeBase';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { KnowledgeArticleFormDialog } from '@/pages/knowledgeBase/KnowledgeArticleFormDialog';

export default function KnowledgeArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: article, isLoading } = useKnowledgeArticle(id);
  const deleteArticle = useDeleteKnowledgeArticle();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !article) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/knowledge-base" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Knowledge Base
        </Link>
      </div>

      <PageHeader
        title={article.title}
        description={article.category ?? undefined}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="text-destructive" />
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <ArticleStatusBadge status={article.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{article.category ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Author</span>
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {article.createdBy ? `${article.createdBy.firstName} ${article.createdBy.lastName}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(article.createdAt)}</span>
              </div>
              {article.publishedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Published</span>
                  <span>{formatDate(article.publishedAt)}</span>
                </div>
              )}
              {article.tags.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Tags</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {article.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Content</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{article.content}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <KnowledgeArticleFormDialog article={article} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this article?"
        description="This cannot be undone."
        destructive
        confirmLabel="Delete Article"
        loading={deleteArticle.isPending}
        onConfirm={() =>
          deleteArticle.mutate(article.id, {
            onSuccess: () => {
              toast.success('Article deleted');
              navigate('/knowledge-base');
            },
          })
        }
      />
    </div>
  );
}
