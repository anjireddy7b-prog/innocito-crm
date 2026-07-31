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
import { useCreateCompany, useUpdateCompany } from '@/api/companies';
import { apiErrorMessage } from '@/lib/api';
import { INDUSTRY_OPTIONS, COUNTRY_OPTIONS } from '@/lib/leadFormOptions';
import type { Company } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Company name is required'),
  domain: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  annualRevenue: z.string().optional(),
  phone: z.string().optional(),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  linkedinUrl: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(company?: Company | null): FormValues {
  return {
    name: company?.name ?? '',
    domain: company?.domain ?? '',
    website: company?.website ?? '',
    industry: company?.industry ?? '',
    companySize: company?.companySize ?? '',
    annualRevenue: company?.annualRevenue ?? '',
    phone: company?.phone ?? '',
    addressLine: company?.addressLine ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    country: company?.country ?? '',
    postalCode: company?.postalCode ?? '',
    linkedinUrl: company?.linkedinUrl ?? '',
    notes: company?.notes ?? '',
  };
}

export function CompanyFormDialog({ company, open, onOpenChange }: { company?: Company | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!company;
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany(company?.id ?? '');

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(company),
  });

  useEffect(() => {
    if (open) reset(toDefaults(company));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      domain: values.domain || undefined,
      website: values.website || undefined,
      industry: values.industry || undefined,
      companySize: values.companySize || undefined,
      annualRevenue: values.annualRevenue ? Number(values.annualRevenue) : undefined,
      phone: values.phone || undefined,
      addressLine: values.addressLine || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      country: values.country || undefined,
      postalCode: values.postalCode || undefined,
      linkedinUrl: values.linkedinUrl || undefined,
      notes: values.notes || undefined,
    };
    try {
      if (isEdit) {
        await updateCompany.mutateAsync(payload);
        toast.success('Company updated');
      } else {
        await createCompany.mutateAsync(payload);
        toast.success('Company created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} company`));
    }
  }

  const isPending = createCompany.isPending || updateCompany.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Company' : 'New Company'}</DialogTitle>
          <DialogDescription>Company records are shared across leads and contacts.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Company Name *</Label>
            <Input {...register('name')} placeholder="Acme Corporation" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Website Domain</Label>
            <Input {...register('domain')} placeholder="acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Website URL</Label>
            <Input {...register('website')} placeholder="https://acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Controller
              control={control}
              name="industry"
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select industry…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {/* A legacy free-text value not in the curated list still shows up, so editing an
                        older company doesn't silently blank out or overwrite its existing Industry. */}
                    {field.value && !(INDUSTRY_OPTIONS as readonly string[]).includes(field.value) && (
                      <SelectItem value={field.value}>{field.value}</SelectItem>
                    )}
                    {INDUSTRY_OPTIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Company Size</Label>
            <Input {...register('companySize')} placeholder="51-200" />
          </div>
          <div className="space-y-1.5">
            <Label>Annual Revenue (USD)</Label>
            <Input type="number" min={0} {...register('annualRevenue')} placeholder="1000000" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input {...register('addressLine')} placeholder="Street address" />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input {...register('city')} />
          </div>
          <div className="space-y-1.5">
            <Label>State / Province</Label>
            <Input {...register('state')} />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select country…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {field.value && !(COUNTRY_OPTIONS as readonly string[]).includes(field.value) && (
                      <SelectItem value={field.value}>{field.value}</SelectItem>
                    )}
                    {COUNTRY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Postal Code</Label>
            <Input {...register('postalCode')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>LinkedIn URL</Label>
            <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/company/acme" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} {...register('notes')} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Company'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
