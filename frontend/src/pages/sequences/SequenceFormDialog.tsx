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
import { useCreateSequence, useUpdateSequence } from '@/api/sequences';
import { apiErrorMessage } from '@/lib/api';
import type { Sequence } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(s?: Sequence | null): FormValues {
  return { name: s?.name ?? '', description: s?.description ?? '' };
}

// Create/edit dialog for a sequence — mirrors CaseFormDialog.tsx's structure. Status is
// deliberately NOT editable here: activating/archiving is its own action on
// SequenceDetailPage, right next to the sequence's status badge, since activation has its own
// validation (>=1 step) and archiving has its own side effect (exiting in-flight enrollments) —
// same reasoning CaseFormDialog gives for keeping status out of its own form.
export function SequenceFormDialog({ sequence, open, onOpenChange }: { sequence?: Sequence | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!sequence;
  const createSequence = useCreateSequence();
  const updateSequence = useUpdateSequence(sequence?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(sequence),
  });

  useEffect(() => {
    if (open) reset(toDefaults(sequence));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sequence?.id]);

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name, description: values.description || undefined };
    try {
      if (isEdit) {
        await updateSequence.mutateAsync(payload);
        toast.success('Sequence updated');
      } else {
        await createSequence.mutateAsync(payload);
        toast.success('Sequence created as a draft — add steps, then activate it');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} sequence`));
    }
  }

  const isPending = createSequence.isPending || updateSequence.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Sequence' : 'New Sequence'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this sequence\'s name and description.' : 'A new sequence starts as a draft — add at least one step before activating it.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="Cold outreach — SaaS leads" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} {...register('description')} placeholder="What this sequence is for and who it's meant for…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Sequence'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
