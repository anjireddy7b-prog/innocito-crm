import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateStep, useUpdateStep } from '@/api/sequences';
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
  step,
  stepNumber,
  open,
  onOpenChange,
}: {
  sequenceId: string;
  step?: SequenceStep | null;
  stepNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!step;
  const createStep = useCreateStep(sequenceId);
  const updateStep = useUpdateStep(sequenceId, step?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(step),
  });

  useEffect(() => {
    if (open) reset(toDefaults(step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step?.id]);

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
