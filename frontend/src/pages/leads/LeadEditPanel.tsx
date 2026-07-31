import { useEffect } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebsiteField } from '@/components/shared/WebsiteField';
import { CompanyDetailsFields } from '@/components/shared/CompanyDetailsFields';
import { MeetingScheduleFields } from '@/components/shared/MeetingScheduleFields';
import { SdrAndReceivedDateFields } from '@/components/shared/SdrAndReceivedDateFields';
import { useUpdateLead } from '@/api/leads';
import { useCampaigns } from '@/api/campaigns';
import { apiErrorMessage } from '@/lib/api';
import { LEAD_SOURCES, LEAD_PRIORITIES } from '@/types';
import { companyDetailsSchema, meetingScheduleSchema, isValidMeetingTime } from '@/lib/leadFormOptions';
import type { Lead } from '@/types';

// Field order mirrors LeadFormDialog.tsx's New Lead form field-for-field (Company Name → Website
// → … → Company details → Meeting schedule → Email Response) via the same shared field
// components and schema fragments, then appends the handful of fields that only ever applied to
// editing an in-flight deal (Currency, Probability, Expected Close Date, Meeting Details, MoM,
// Next Steps) — those never existed on the New Lead form and stay Edit-only.
const schema = z
  .object({
    source: z.enum(LEAD_SOURCES as [string, ...string[]]),
    priority: z.enum(LEAD_PRIORITIES as [string, ...string[]]),
    category: z.string().optional(),
    dealValue: z.string().optional(),
    currency: z.string().optional(),
    probability: z.string().optional(),
    expectedCloseDate: z.string().optional(),
    campaignId: z.string().optional(),
    sdrId: z.string().nullable().optional(),
    leadReceivedDate: z.string().optional(),
    meetingDetails: z.string().optional(),
    nextSteps: z.string().optional(),
    mom: z.string().optional(),
    emailResponse: z.string().optional(),
  })
  .merge(companyDetailsSchema)
  .merge(meetingScheduleSchema)
  .refine(isValidMeetingTime, { message: 'Enter a valid time (HH:MM)', path: ['meetingScheduledTime'] });
type FormValues = z.infer<typeof schema>;

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function toDefaults(lead: Lead): FormValues {
  const initialMeeting = lead.meetings?.find((m) => m.title === 'Initial Meeting');
  return {
    source: lead.source,
    priority: lead.priority,
    category: lead.category ?? '',
    dealValue: lead.dealValue ?? '',
    currency: lead.currency ?? 'USD',
    probability: lead.probability != null ? String(lead.probability) : '',
    expectedCloseDate: toDateInputValue(lead.expectedCloseDate),
    campaignId: lead.campaignId ?? undefined,
    sdrId: lead.sdrId ?? undefined,
    leadReceivedDate: toDateInputValue(lead.leadReceivedDate),
    meetingDetails: lead.meetingDetails ?? '',
    nextSteps: lead.nextSteps ?? '',
    mom: lead.mom ?? '',
    emailResponse: lead.emailResponse ?? '',
    // Pre-populated from the linked company's current values — same fields, same curated
    // dropdowns, same validation as the New Lead form's Company details block. Saving here
    // updates that (possibly shared) company record directly, unlike lead-creation time where
    // inline company details only ever apply to a brand-new company.
    industry: lead.company?.industry ?? undefined,
    country: lead.company?.country ?? undefined,
    state: lead.company?.state ?? undefined,
    website: lead.company?.website ?? undefined,
    revenue: lead.company?.annualRevenue ?? undefined,
    // Pre-populated from the lead's "Initial Meeting" — the one this same form owns (created here
    // or via the New Lead form) — never from other meetings added on the Meetings tab, since
    // saving this form reschedules that specific meeting (see updateLead() in leads.service.ts).
    // Leaving these blank on a lead with no Initial Meeting yet creates one on save, exactly like
    // the New Lead form.
    meetingScheduledDate: initialMeeting ? toDateInputValue(initialMeeting.scheduledAt) : undefined,
    meetingScheduledTime: initialMeeting ? initialMeeting.scheduledAt.slice(11, 16) : undefined,
    meetingTimeZone: initialMeeting?.timeZone ?? undefined,
  };
}

export function LeadEditPanel({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateLead = useUpdateLead(lead.id);
  const { data: campaigns } = useCampaigns({ pageSize: 100 });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(lead),
  });

  const watchedCountry = useWatch({ control, name: 'country' });

  useEffect(() => {
    if (open) reset(toDefaults(lead));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

  async function onSubmit(values: FormValues) {
    try {
      const hasCompanyDetails = values.industry || values.country || values.state || values.website || values.revenue;
      await updateLead.mutateAsync({
        source: values.source,
        priority: values.priority,
        category: values.category || undefined,
        dealValue: values.dealValue ? Number(values.dealValue) : undefined,
        currency: values.currency || undefined,
        probability: values.probability ? Number(values.probability) : undefined,
        expectedCloseDate: values.expectedCloseDate ? new Date(values.expectedCloseDate).toISOString() : undefined,
        campaignId: values.campaignId || undefined,
        sdrId: values.sdrId || undefined,
        leadReceivedDate: values.leadReceivedDate || undefined,
        meetingDetails: values.meetingDetails || undefined,
        nextSteps: values.nextSteps || undefined,
        mom: values.mom || undefined,
        emailResponse: values.emailResponse || undefined,
        company:
          lead.company && hasCompanyDetails
            ? {
                industry: values.industry || undefined,
                country: values.country || undefined,
                state: values.state || undefined,
                website: values.website || undefined,
                annualRevenue: values.revenue ? Number(values.revenue) : undefined,
              }
            : undefined,
        meetingScheduledDate: values.meetingScheduledDate || undefined,
        meetingScheduledTime: values.meetingScheduledTime || undefined,
        meetingTimeZone: values.meetingTimeZone || undefined,
      });
      toast.success('Lead updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update lead'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>Update company, deal, ownership, and engagement details for {lead.displayId}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Company Name</Label>
            <Input value={lead.company?.name ?? '—'} disabled />
            <p className="text-xs text-muted-foreground">Renaming a company is done from the Accounts page — it&apos;s shared across every lead linked to it.</p>
          </div>

          <WebsiteField register={register} errors={errors} />

          <div className="space-y-1.5">
            <Label>Lead Source</Label>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Campaign</Label>
            <Controller
              control={control}
              name="campaignId"
              render={({ field }) => (
                <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="No campaign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No campaign</SelectItem>
                    {campaigns?.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input {...register('category')} placeholder="Enterprise / SMB / …" />
          </div>

          <SdrAndReceivedDateFields control={control} register={register} errors={errors} />

          <div className="space-y-1.5">
            <Label>Deal Value</Label>
            <Input type="number" min={0} {...register('dealValue')} placeholder="50000" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input {...register('currency')} placeholder="USD" maxLength={3} className="uppercase" />
          </div>

          <div className="space-y-1.5">
            <Label>Probability (%)</Label>
            <Input type="number" min={0} max={100} {...register('probability')} placeholder="60" />
            {errors.probability && <p className="text-xs text-destructive">{errors.probability.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Expected Close Date</Label>
            <Input type="date" {...register('expectedCloseDate')} />
          </div>

          <CompanyDetailsFields control={control} register={register} errors={errors} />

          <MeetingScheduleFields control={control} register={register} errors={errors} country={watchedCountry} />

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Meeting Details</Label>
            <Textarea rows={2} {...register('meetingDetails')} placeholder="Latest meeting summary…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Minutes of Meeting (MoM)</Label>
            <Textarea rows={2} {...register('mom')} placeholder="Key discussion points, decisions…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Next Steps</Label>
            <Textarea rows={2} {...register('nextSteps')} placeholder="What happens next…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email Response</Label>
            <Textarea rows={2} {...register('emailResponse')} placeholder="Additional notes…" />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={updateLead.isPending}>Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
