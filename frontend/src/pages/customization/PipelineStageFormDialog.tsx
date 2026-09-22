import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useUpdatePipelineStage, type PipelineStage } from '@/api/pipelineStages';
import { apiErrorMessage } from '@/lib/api';

const schema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(150),
  sortOrder: z.coerce.number().int().min(0),
  isWon: z.boolean(),
  isLost: z.boolean(),
  isTerminal: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(stage?: PipelineStage | null): FormValues {
  return {
    label: stage?.label ?? '',
    sortOrder: stage?.sortOrder ?? 0,
    isWon: stage?.isWon ?? false,
    isLost: stage?.isLost ?? false,
    isTerminal: stage?.isTerminal ?? false,
  };
}

/**
 * Phase 4: edit-only dialog for one of an org's 13 pipeline stages — rename, reorder, and toggle
 * the won/lost/terminal flags dashboard.service.ts and leads.service.ts read. `key` itself is
 * never editable (see db/schema.ts's pipelineStages table comment) since it's what that business
 * logic joins against — creating/deleting brand-new stages is out of scope this phase.
 */
export function PipelineStageFormDialog({ stage, open, onOpenChange }: { stage: PipelineStage | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateStage = useUpdatePipelineStage(stage?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(stage),
  });

  useEffect(() => {
    if (open) reset(toDefaults(stage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage?.id]);

  async function onSubmit(values: FormValues) {
    if (values.isWon && values.isLost) {
      toast.error('A stage cannot be both won and lost');
      return;
    }
    try {
      await updateStage.mutateAsync(values);
      toast.success('Pipeline stage updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update pipeline stage'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit {stage?.label}</DialogTitle>
          <DialogDescription>Stage key: <code className="text-xs">{stage?.key}</code> (fixed — matches existing lead data).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Label *</Label>
            <Input {...register('label')} />
            {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Order</Label>
            <Input type="number" min={0} {...register('sortOrder')} />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Controller control={control} name="isWon" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />} />
              Counts as Won
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller control={control} name="isLost" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />} />
              Counts as Lost
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller control={control} name="isTerminal" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />} />
              Terminal (lead is no longer in progress)
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={updateStage.isPending}>Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
