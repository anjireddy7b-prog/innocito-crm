import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateKnowledgeArticle, useUpdateKnowledgeArticle } from '@/api/knowledgeBase';
import { apiErrorMessage } from '@/lib/api';
import type { KnowledgeArticle } from '@/types';

// Curated suggestions only — never DB-constrained (same "curated dropdown, free-text column"
// precedent as CompanyFormDialog's Industry field). An article authored before this list existed,
// or with an org-specific category not listed here, still round-trips fine.
const CATEGORY_OPTIONS = ['Product', 'Onboarding', 'Billing', 'Technical', 'Account Management', 'Policy', 'Other'] as const;

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.string().optional(),
  tags: z.string().optional(), // comma-separated in the form; split into string[] on submit
  content: z.string().min(1, 'Content is required'),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(a?: KnowledgeArticle | null): FormValues {
  return {
    title: a?.title ?? '',
    category: a?.category ?? '',
    tags: a?.tags?.join(', ') ?? '',
    content: a?.content ?? '',
    status: a?.status ?? 'DRAFT',
  };
}

// Create/edit dialog for a knowledge base article — mirrors CaseFormDialog.tsx's structure.
// Unlike cases, status IS editable here directly (Draft/Published is a simple binary toggle with
// no other lifecycle state, so it doesn't need its own dedicated detail-page control the way a
// case's 6-state status does).
export function KnowledgeArticleFormDialog({ article, open, onOpenChange }: { article?: KnowledgeArticle | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!article;
  const createArticle = useCreateKnowledgeArticle();
  const updateArticle = useUpdateKnowledgeArticle(article?.id ?? '');

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(article),
  });

  useEffect(() => {
    if (open) reset(toDefaults(article));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, article?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      title: values.title,
      category: values.category || undefined,
      tags: (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      content: values.content,
      status: values.status,
    };
    try {
      if (isEdit) {
        await updateArticle.mutateAsync(payload);
        toast.success('Article updated');
      } else {
        await createArticle.mutateAsync(payload);
        toast.success('Article created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} article`));
    }
  }

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Article' : 'New Article'}</DialogTitle>
          <DialogDescription>Internal reference content for the team — publish when it's ready to be seen by everyone.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Title *</Label>
            <Input {...register('title')} placeholder="How to process a refund" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {field.value && !(CATEGORY_OPTIONS as readonly string[]).includes(field.value) && (
                      <SelectItem value={field.value}>{field.value}</SelectItem>
                    )}
                    {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tags</Label>
            <Input {...register('tags')} placeholder="refunds, billing, invoices (comma-separated)" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Content *</Label>
            <Textarea rows={10} {...register('content')} placeholder="Write the article content here…" />
            {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Article'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
