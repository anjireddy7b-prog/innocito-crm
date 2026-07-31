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
import { UserPicker } from '@/components/shared/UserPicker';
import { WebsiteField } from '@/components/shared/WebsiteField';
import { CompanyDetailsFields } from '@/components/shared/CompanyDetailsFields';
import { MeetingScheduleFields } from '@/components/shared/MeetingScheduleFields';
import { SdrAndReceivedDateFields } from '@/components/shared/SdrAndReceivedDateFields';
import { useCreateLead } from '@/api/leads';
import { useCampaigns } from '@/api/campaigns';
import { apiErrorMessage } from '@/lib/api';
import { LEAD_SOURCES, LEAD_PRIORITIES } from '@/types';
import { companyDetailsSchema, meetingScheduleSchema, isValidMeetingTime, todayDateInputValue } from '@/lib/leadFormOptions';
import { useNavigate } from 'react-router-dom';

// Field order below intentionally matches LeadEditPanel.tsx's Edit Lead form field-for-field
// (Company Name → Website → …→ Company details → Meeting schedule → Email Response), per the
// "New Lead and Edit Lead should be visually/functionally identical" requirement. The Company
// details and Meeting schedule blocks, plus the SDR/Lead Received Date pair, are shared
// components/schema fragments (see components/shared/*.tsx and lib/leadFormOptions.ts) reused
// as-is by both forms so the two can't drift apart as fields are added later.
const schema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    designation: z.string().optional(),
    source: z.enum(LEAD_SOURCES as [string, ...string[]]),
    priority: z.enum(LEAD_PRIORITIES as [string, ...string[]]),
    campaignId: z.string().optional(),
    assignedToId: z.string().nullable().optional(),
    dealValue: z.string().optional(),
    category: z.string().optional(),
    emailResponse: z.string().optional(),
    sdrId: z.string().nullable().optional(),
    createdBySdrId: z.string().nullable().optional(),
    leadReceivedDate: z.string().min(1, 'Lead Received Date is required'),
  })
  .merge(companyDetailsSchema)
  .merge(meetingScheduleSchema)
  .refine(isValidMeetingTime, { message: 'Enter a valid time (HH:MM)', path: ['meetingScheduledTime'] });
type FormValues = z.infer<typeof schema>;

export function LeadFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createLead = useCreateLead();
  const { data: campaigns } = useCampaigns({ pageSize: 100 });
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { source: 'EMAIL', priority: 'MEDIUM', leadReceivedDate: todayDateInputValue() },
  });

  const watchedCountry = useWatch({ control, name: 'country' });

  async function onSubmit(values: FormValues) {
    try {
      const hasCompanyDetails = values.industry || values.country || values.state || values.website || values.revenue;
      const lead = await createLead.mutateAsync({
        companyName: values.companyName,
        company: hasCompanyDetails
          ? {
              industry: values.industry || undefined,
              country: values.country || undefined,
              state: values.state || undefined,
              website: values.website || undefined,
              annualRevenue: values.revenue ? Number(values.revenue) : undefined,
            }
          : undefined,
        contact: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email || undefined,
          phone: values.phone || undefined,
          designation: values.designation || undefined,
        },
        source: values.source,
        priority: values.priority,
        campaignId: values.campaignId || undefined,
        assignedToId: values.assignedToId || undefined,
        sdrId: values.sdrId || undefined,
        createdBySdrId: values.createdBySdrId || undefined,
        dealValue: values.dealValue ? Number(values.dealValue) : undefined,
        category: values.category || undefined,
        emailResponse: values.emailResponse || undefined,
        leadReceivedDate: values.leadReceivedDate,
        meetingScheduledDate: values.meetingScheduledDate || undefined,
        meetingScheduledTime: values.meetingScheduledTime || undefined,
        meetingTimeZone: values.meetingTimeZone || undefined,
        status: 'NEW',
      });
      toast.success(`Lead ${lead.displayId} created`);
      reset();
      onOpenChange(false);
      navigate(`/leads/${lead.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create lead'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
          <DialogDescription>Capture the company, contact, and source details. You can enrich the lead further afterward.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Company Name *</Label>
            <Input {...register('companyName')} placeholder="Acme Corporation" />
            {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
          </div>

          <WebsiteField register={register} errors={errors} />

          <div className="space-y-1.5">
            <Label>Contact First Name *</Label>
            <Input {...register('firstName')} placeholder="Jane" />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Contact Last Name *</Label>
            <Input {...register('lastName')} placeholder="Doe" />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...register('email')} placeholder="jane.doe@acme.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Designation / Title</Label>
            <Input {...register('designation')} placeholder="VP of Engineering" />
          </div>

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
                    {LEAD_PRIORITIES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
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
            <Label>Assign To (Inside Sales)</Label>
            <Controller
              control={control}
              name="assignedToId"
              render={({ field }) => <UserPicker value={field.value} onChange={field.onChange} roles={['INSIDE_SALES', 'ADMIN']} />}
            />
          </div>

          <SdrAndReceivedDateFields control={control} register={register} errors={errors} required />

          <div className="space-y-1.5">
            <Label>Estimated Deal Value (USD)</Label>
            <Input type="number" min={0} {...register('dealValue')} placeholder="50000" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input {...register('category')} placeholder="Enterprise / SMB / …" />
          </div>

          <CompanyDetailsFields
            control={control}
            register={register}
            errors={errors}
            title="Company details (used only when this is a new company)"
          />

          <MeetingScheduleFields control={control} register={register} errors={errors} country={watchedCountry} />

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email Response</Label>
            <Textarea rows={3} {...register('emailResponse')} placeholder="Context on how this lead came in…" />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={createLead.isPending}>Create Lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
