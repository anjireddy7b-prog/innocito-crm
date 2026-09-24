import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateStep, useUpdateStep } from '@/api/sequences';
import { useDraftEmail } from '@/api/ai';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import type { SequenceStep } from '@/types';

const schema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  delayDays: z.coerce.number().int().min(0).max(90),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(step?: SequenceStep | null): FormValues {
  return { subject: step?.subject ?? '', body: step?.body ?? '', delayDays: step?.delayDays ?? 0 };
}

// Add/edit dialog for a single step. Body is a plain textarea, not a rich-text editor — matches
// Knowledge Base's `content` field convention (whitespace-pre-wrap on render, see
// KnowledgeArticleDetailPage.tsx), kept simple deliberately (see sequences.service.ts's top
// comment on scope). delayDays counts business days after the PREVIOUS step was sent (or after
// enrollment, for the first step) — 0 sends immediately, subject to the org's send window.
export function SequenceStepFormDialog({
  sequenceId,
  sequenceName,
  step,
  stepNumber,
  open,
  onOpenChange,
}: {
  sequenceId: string;
  sequenceName?: string;
  step?: SequenceStep | null;
  stepNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!step;
  const createStep = useCreateStep(sequenceId);
  const updateStep = useUpdateStep(sequenceId, step?.id ?? '');
  const draftEmail = useDraftEmail();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [instructions, setInstructions] = useState('');

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(step),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(step));
      setInstructions('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step?.id]);

  // Phase 14 (AI), email/sequence drafting assistant. Stateless — fills the subject/body fields
  // this dialog already owns, same as if the rep had typed them; nothing is saved until the
  // dialog's own Save/Add button is pressed, so a bad draft is trivially discardable/editable.
  async function handleDraft() {
    if (!instructions.trim()) {
      toast.error('Describe what this email should say first');
      return;
    }
    try {
      const draft = await draftEmail.mutateAsync({ instructions, sequenceName, stepNumber });
      setValue('subject', draft.subject, { shouldValidate: true, shouldDirty: true });
      setValue('body', draft.body, { shouldValidate: true, shouldDirty: true });
      toast.success('Draft generated — review and edit before saving');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to draft email'));
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit) {
        await updateStep.mutateAsync(values);
        toast.success('Step updated');
      } else {
        await createStep.mutateAsync(values);
        toast.success('Step added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'add'} step`));
    }
  }

  const isPending = createStep.isPending || updateStep.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Step ${stepNumber}` : `Add Step ${stepNumber}`}</DialogTitle>
          <DialogDescription>
            {stepNumber === 1
              ? 'Sent as soon as a lead is enrolled (subject to the send window), unless you set a delay.'
              : "Sent this many business days after the previous step, subject to the org's send window."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {hasPermission(PERMISSIONS.AI_FEATURES_USE) && (
            <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 bg-secondary/30 p-3">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Draft with AI
              </Label>
              <div className="flex gap-2">
                <Input
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder='e.g. "Follow up after a demo, ask for a next meeting"'
                  className="h-9"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleDraft} loading={draftEmail.isPending}>
                  Draft
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Subject *</Label>
            <Input {...register('subject')} placeholder="Quick question about {{company}}" />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Body *</Label>
            <Textarea rows={8} {...register('body')} placeholder="Write the email body…" />
            {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Delay (business days) *</Label>
            <Input type="number" min={0} max={90} {...register('delayDays')} className="w-32" />
            {errors.delayDays && <p className="text-xs text-destructive">{errors.delayDays.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Add Step'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
