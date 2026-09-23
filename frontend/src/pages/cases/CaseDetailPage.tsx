import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, User, Pencil, Trash2, Send } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { CaseStatusBadge, CasePriorityBadge } from '@/components/shared/StatusBadge';
import { useCase, useUpdateCase, useDeleteCase } from '@/api/cases';
import { useCaseComments, useCreateCaseComment, useDeleteCaseComment } from '@/api/caseComments';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { formatDate, formatRelativeTime, initials } from '@/lib/utils';
import type { CaseStatus } from '@/types';
import { CaseFormDialog } from '@/pages/cases/CaseFormDialog';

const STATUS_OPTIONS: CaseStatus[] = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'];

function CaseCommentsSection({ caseId, canManage }: { caseId: string; canManage: boolean }) {
  const { data: comments, isLoading } = useCaseComments(caseId);
  const createComment = useCreateCaseComment();
  const deleteComment = useDeleteCaseComment();
  const currentUser = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [body, setBody] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await createComment.mutateAsync({ caseId, body: body.trim() });
      setBody('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to post comment'));
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Comments</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(currentUser?.firstName, currentUser?.lastName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea rows={2} placeholder="Log an update on this case…" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={createComment.isPending} disabled={!body.trim()}>
                  <Send /> Post Comment
                </Button>
              </div>
            </div>
          </form>
        )}

        {!isLoading && comments?.length === 0 && <EmptyState title="No comments yet" description="Updates on this case will appear here." />}

        <div className="space-y-4">
          {comments?.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(c.user.firstName, c.user.lastName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{c.user.firstName} {c.user.lastName}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(c.createdAt)}</p>
                    {(currentUser?.id === c.userId || hasPermission(PERMISSIONS.COMMENTS_MANAGE_ANY)) && (
                      <button onClick={() => deleteComment.mutate(c.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: caseRecord, isLoading } = useCase(id);
  const updateCase = useUpdateCase(id ?? '');
  const deleteCase = useDeleteCase();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !caseRecord) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.CASES_MANAGE);

  async function handleStatusChange(status: CaseStatus) {
    try {
      await updateCase.mutateAsync({ status });
      toast.success('Case status updated');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update status'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/cases" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Cases
        </Link>
      </div>

      <PageHeader
        title={caseRecord.subject}
        description={caseRecord.displayId}
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
            <CardHeader><CardTitle>Case Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                {canManage ? (
                  <Select value={caseRecord.status} onValueChange={(v) => handleStatusChange(v as CaseStatus)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <CaseStatusBadge status={caseRecord.status} />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Priority</span>
                <CasePriorityBadge priority={caseRecord.priority} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned To</span>
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {caseRecord.assignedTo ? `${caseRecord.assignedTo.firstName} ${caseRecord.assignedTo.lastName}` : 'Unassigned'}
                </span>
              </div>
              {caseRecord.company && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <Link to={`/companies/${caseRecord.company.id}`} className="flex items-center gap-1.5 hover:text-primary hover:underline">
                    <Building2 className="h-3.5 w-3.5" />
                    {caseRecord.company.name}
                  </Link>
                </div>
              )}
              {caseRecord.contact && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Contact</span>
                  <Link to={`/contacts/${caseRecord.contact.id}`} className="hover:text-primary hover:underline">
                    {caseRecord.contact.firstName} {caseRecord.contact.lastName}
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">Opened</span>
                <span>{formatDate(caseRecord.createdAt)}</span>
              </div>
              {caseRecord.resolvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Resolved</span>
                  <span>{formatDate(caseRecord.resolvedAt)}</span>
                </div>
              )}
              {caseRecord.closedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Closed</span>
                  <span>{formatDate(caseRecord.closedAt)}</span>
                </div>
              )}
              {caseRecord.description && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap">{caseRecord.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <CaseCommentsSection caseId={caseRecord.id} canManage={canManage} />
        </div>
      </div>

      <CaseFormDialog case={caseRecord} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this case?"
        description="This cannot be undone. All comments on this case will be deleted with it."
        destructive
        confirmLabel="Delete Case"
        loading={deleteCase.isPending}
        onConfirm={() =>
          deleteCase.mutate(caseRecord.id, {
            onSuccess: () => {
              toast.success('Case deleted');
              navigate('/cases');
            },
          })
        }
      />
    </div>
  );
}
