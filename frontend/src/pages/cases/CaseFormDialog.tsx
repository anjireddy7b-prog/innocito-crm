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
import { UserPicker } from '@/components/shared/UserPicker';
import { useCreateCase, useUpdateCase } from '@/api/cases';
import { useCompanies } from '@/api/companies';
import { useContacts } from '@/api/contacts';
import { apiErrorMessage } from '@/lib/api';
import type { Case } from '@/types';

const schema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
  companyId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  assignedToId: z.string().uuid().nullable().optional(),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(c?: Case | null): FormValues {
  return {
    subject: c?.subject ?? '',
    description: c?.description ?? '',
    companyId: c?.companyId ?? null,
    contactId: c?.contactId ?? null,
    priority: c?.priority ?? 'MEDIUM',
    assignedToId: c?.assignedToId ?? null,
  };
}

// Create/edit dialog for a case — mirrors CompanyFormDialog.tsx's structure. Status is
// deliberately NOT editable here: it's changed from CaseDetailPage's own status Select, right
// next to the case's current status badge, rather than buried in this form (same reasoning as
// tasks/leads keeping their own status transitions out of their general edit forms where a
// dedicated control exists).
export function CaseFormDialog({ case: caseRecord, open, onOpenChange }: { case?: Case | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!caseRecord;
  const createCase = useCreateCase();
  const updateCase = useUpdateCase(caseRecord?.id ?? '');
  const { data: companies } = useCompanies({ page: 1, pageSize: 100, sortBy: 'name', sortDir: 'asc' });
  const { data: contacts } = useContacts({ page: 1, pageSize: 100, sortBy: 'lastName', sortDir: 'asc' });

  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(caseRecord),
  });
  const selectedCompanyId = watch('companyId');

  useEffect(() => {
    if (open) reset(toDefaults(caseRecord));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, caseRecord?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      subject: values.subject,
      description: values.description || undefined,
      companyId: values.companyId || undefined,
      contactId: values.contactId || undefined,
      priority: values.priority,
      assignedToId: values.assignedToId || undefined,
    };
    try {
      if (isEdit) {
        await updateCase.mutateAsync(payload);
        toast.success('Case updated');
      } else {
        await createCase.mutateAsync(payload);
        toast.success('Case created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} case`));
    }
  }

  const isPending = createCase.isPending || updateCase.isPending;
  const contactOptions = contacts?.data.filter((c) => !selectedCompanyId || c.companyId === selectedCompanyId) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Case' : 'New Case'}</DialogTitle>
          <DialogDescription>Track a support or service issue, optionally linked to a company and contact.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Subject *</Label>
            <Input {...register('subject')} placeholder="Cannot access the reporting dashboard" />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} {...register('description')} placeholder="What's happening, and any steps already tried…" />
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
                    {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Assigned To</Label>
            <Controller
              control={control}
              name="assignedToId"
              render={({ field }) => <UserPicker value={field.value} onChange={field.onChange} placeholder="Unassigned" />}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Controller
              control={control}
              name="companyId"
              render={({ field }) => (
                <Select
                  value={field.value ?? '__none__'}
                  onValueChange={(v) => {
                    field.onChange(v === '__none__' ? null : v);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No company</SelectItem>
                    {companies?.data.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Controller
              control={control}
              name="contactId"
              render={({ field }) => (
                <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="No contact" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No contact</SelectItem>
                    {contactOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Case'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
