import { useState } from 'react';
import { toast } from 'sonner';
import { Send, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/EmptyState';
import { useComments, useCreateComment, useDeleteComment } from '@/api/comments';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/api';
import { formatRelativeTime, initials } from '@/lib/utils';

export function CommentsTab({ leadId }: { leadId: string }) {
  const { data: comments, isLoading } = useComments(leadId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const currentUser = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await createComment.mutateAsync({ leadId, body: body.trim() });
      setBody('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to post comment'));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials(currentUser?.firstName, currentUser?.lastName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <Textarea rows={2} placeholder="Add a comment for the team…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={createComment.isPending} disabled={!body.trim()}>
              <Send /> Post Comment
            </Button>
          </div>
        </div>
      </form>

      {!isLoading && comments?.length === 0 && <EmptyState title="No comments yet" description="Start the conversation on this lead." />}

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
                  {currentUser?.id === c.userId && (
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
    </div>
  );
}
