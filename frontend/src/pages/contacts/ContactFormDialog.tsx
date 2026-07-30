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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateContact, useUpdateContact } from '@/api/contacts';
import { useCompanies } from '@/api/companies';
import { apiErrorMessage } from '@/lib/api';
import type { Contact } from '@/types';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyId: z.string().optional(),
  designation: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  linkedinUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(contact?: Contact | null): FormValues {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    companyId: contact?.companyId ?? undefined,
    designation: contact?.designation ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    linkedinUrl: contact?.linkedinUrl ?? '',
    city: contact?.city ?? '',
    state: contact?.state ?? '',
    country: contact?.country ?? '',
    isPrimary: contact?.isPrimary ?? false,
    notes: contact?.notes ?? '',
  };
}

export function ContactFormDialog({ contact, open, onOpenChange }: { contact?: Contact | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!contact;
  const createContact = useCreateContact();
  const updateContact = useUpdateContact(contact?.id ?? '');
  const { data: companies } = useCompanies({ pageSize: 100 });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(contact),
  });

  useEffect(() => {
    if (open) reset(toDefaults(contact));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      companyId: values.companyId || undefined,
      designation: values.designation || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      linkedinUrl: values.linkedinUrl || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      country: values.country || undefined,
      isPrimary: values.isPrimary,
      notes: values.notes || undefined,
    };
    try {
      if (isEdit) {
        await updateContact.mutateAsync(payload);
        toast.success('Contact updated');
      } else {
        await createContact.mutateAsync(payload);
        toast.success('Contact created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} contact`));
    }
  }

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'New Contact'}</DialogTitle>
          <DialogDescription>Contacts can be linked to a company and reused across multiple leads.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First Name *</Label>
            <Input {...register('firstName')} placeholder="Jane" />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Last Name *</Label>
            <Input {...register('lastName')} placeholder="Doe" />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Company</Label>
            <Controller
              control={control}
              name="companyId"
              render={({ field }) => (
                <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No company</SelectItem>
                    {companies?.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input {...register('designation')} placeholder="VP of Engineering" />
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
          <div className="space-y-1.5">
            <Label>LinkedIn URL</Label>
            <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/janedoe" />
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
            <Input {...register('country')} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Controller control={control} name="isPrimary" render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={field.onChange} id="isPrimary" />
            )} />
            <Label htmlFor="isPrimary" className="cursor-pointer font-normal">Primary contact for this company</Label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} {...register('notes')} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Contact'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
