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
import { useCreateWebhookEndpoint } from '@/api/webhooks';
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from '@/lib/webhookEvents';
import { apiErrorMessage } from '@/lib/api';

const schema = z.object({
  url: z.string().url('Enter a valid URL, e.g. https://example.com/hooks/crm'),
  eventTypes: z.array(z.string()).min(1, 'Select at least one event'),
});
type FormValues = z.infer<typeof schema>;

/**
 * Phase 11 (API/integrations), slice 2. Same shape as ApiKeyFormDialog.tsx — a checklist of a
 * fixed catalog (events here, permissions there) — but simpler: no "reveal once" step, since a
 * webhook secret isn't a bearer credential (see api/webhooks.ts's own comment); the endpoint just
 * appears in the list immediately with its secret visible, same as everything else about it.
 */
export function WebhookFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createWebhook = useCreateWebhookEndpoint();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { url: '', eventTypes: [] },
  });

  useEffect(() => {
    if (open) reset({ url: '', eventTypes: [] });
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await createWebhook.mutateAsync(values);
      toast.success('Webhook endpoint created');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create webhook endpoint'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New Webhook Endpoint</DialogTitle>
          <DialogDescription>
            This app will POST a signed JSON payload to this URL whenever a subscribed event happens. The signing secret is shown after creation and any time you come back to this page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Endpoint URL *</Label>
            <Input {...register('url')} placeholder="https://example.com/hooks/crm" />
            {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Events *</Label>
            <Controller
              control={control}
              name="eventTypes"
              render={({ field }) => (
                <div className="space-y-2 rounded-lg border border-border/60 p-4">
                  {ALL_WEBHOOK_EVENTS.map((eventType) => {
                    const checked = field.value.includes(eventType);
                    return (
                      <label key={eventType} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = v ? [...field.value, eventType] : field.value.filter((k) => k !== eventType);
                            field.onChange(next);
                          }}
                        />
                        <span>
                          <code className="text-xs">{eventType}</code>
                          <span className="block text-xs text-muted-foreground">{WEBHOOK_EVENT_LABELS[eventType]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.eventTypes && <p className="text-xs text-destructive">{errors.eventTypes.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={createWebhook.isPending}>Create Endpoint</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
