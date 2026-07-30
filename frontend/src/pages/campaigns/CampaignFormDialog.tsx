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
import { useCreateCampaign, useUpdateCampaign } from '@/api/campaigns';
import { apiErrorMessage } from '@/lib/api';
import type { Campaign } from '@/types';

const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;

const schema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  code: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(CAMPAIGN_STATUSES),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function toDefaults(campaign?: Campaign | null): FormValues {
  return {
    name: campaign?.name ?? '',
    code: campaign?.code ?? '',
    description: campaign?.description ?? '',
    status: (campaign?.status as (typeof CAMPAIGN_STATUSES)[number]) ?? 'ACTIVE',
    startDate: toDateInputValue(campaign?.startDate ?? null),
    endDate: toDateInputValue(campaign?.endDate ?? null),
    budget: campaign?.budget ?? '',
  };
}

export function CampaignFormDialog({ campaign, open, onOpenChange }: { campaign?: Campaign | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!campaign;
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign(campaign?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(campaign),
  });

  useEffect(() => {
    if (open) reset(toDefaults(campaign));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      code: values.code || undefined,
      description: values.description || undefined,
      status: values.status,
      startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
      endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
      budget: values.budget ? Number(values.budget) : undefined,
    };
    try {
      if (isEdit) {
        await updateCampaign.mutateAsync(payload);
        toast.success('Campaign updated');
      } else {
        await createCampaign.mutateAsync(payload);
        toast.success('Campaign created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} campaign`));
    }
  }

  const isPending = createCampaign.isPending || updateCampaign.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
          <DialogDescription>Track marketing and outbound campaigns feeding your pipeline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Campaign Name *</Label>
            <Input {...register('name')} placeholder="Q3 Outbound — Manufacturing" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Campaign Code</Label>
            <Input {...register('code')} placeholder="Q3-MFG" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller control={control} name="status" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAMPAIGN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" {...register('startDate')} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input type="date" {...register('endDate')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Budget (USD)</Label>
            <Input type="number" min={0} {...register('budget')} placeholder="25000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} {...register('description')} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Campaign'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
