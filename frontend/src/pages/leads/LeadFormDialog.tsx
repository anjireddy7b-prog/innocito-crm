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
import { MeetingTimeZoneField } from '@/components/shared/MeetingTimeZoneField';
import { useCreateLead } from '@/api/leads';
import { useCampaigns } from '@/api/campaigns';
import { apiErrorMessage } from '@/lib/api';
import { LEAD_SOURCES, LEAD_PRIORITIES } from '@/types';
import { INDUSTRY_OPTIONS, COUNTRY_OPTIONS } from '@/lib/leadFormOptions';
import { useNavigate } from 'react-router-dom';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

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

    // Company detail fields — only applied when the company is newly created (see leads.service.ts).
    industry: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    website: z.string().optional(),
    revenue: z.string().optional(),

    sdrId: z.string().nullable().optional(),
    leadReceivedDate: z.string().min(1, 'Lead Received Date is required'),

    meetingScheduledDate: z.string().optional(),
    meetingScheduledTime: z.string().optional(),
    meetingTimeZone: z.string().optional(),
  })
  .refine((v) => !v.meetingScheduledTime || TIME_REGEX.test(v.meetingScheduledTime), {
    message: 'Enter a valid time (HH:MM)',
    path: ['meetingScheduledTime'],
  });
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

          <div className="space-y-1.5">
            <Label>SDR Name</Label>
            <Controller
              control={control}
              name="sdrId"
              render={({ field }) => (
                <UserPicker value={field.value} onChange={field.onChange} roles={['INSIDE_SALES']} placeholder="Select SDR…" />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lead Received Date *</Label>
            <Input type="date" {...register('leadReceivedDate')} />
            {errors.leadReceivedDate && <p className="text-xs text-destructive">{errors.leadReceivedDate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Estimated Deal Value (USD)</Label>
            <Input type="number" min={0} {...register('dealValue')} placeholder="50000" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input {...register('category')} placeholder="Enterprise / SMB / …" />
          </div>

          <div className="sm:col-span-2 rounded-md border border-border p-3 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Company details (used only when this is a new company)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Controller
                  control={control}
                  name="industry"
                  render={({ field }) => (
                    <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                      <SelectTrigger><SelectValue placeholder="Select industry…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {INDUSTRY_OPTIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Revenue</Label>
                <Input type="number" min={0} {...register('revenue')} placeholder="5000000" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Controller
                  control={control}
                  name="country"
                  render={({ field }) => (
                    <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                      <SelectTrigger><SelectValue placeholder="Select country…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {COUNTRY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input {...register('state')} placeholder="Texas" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Website</Label>
                <Input {...register('website')} placeholder="acme.com" />
                {errors.website && <p className="text-xs text-destructive">{errors.website.message as string}</p>}
              </div>
            </div>
          </div>

          <div className="sm:col-span-2 rounded-md border border-border p-3 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Meeting schedule (optional — creates a meeting on this lead)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Meeting Scheduled Date</Label>
                <Input type="date" {...register('meetingScheduledDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Meeting Scheduled Time</Label>
                <Input type="time" {...register('meetingScheduledTime')} />
                {errors.meetingScheduledTime && <p className="text-xs text-destructive">{errors.meetingScheduledTime.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Meeting Time Zone</Label>
                <Controller
                  control={control}
                  name="meetingTimeZone"
                  render={({ field }) => (
                    <MeetingTimeZoneField country={watchedCountry} value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          </div>

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
