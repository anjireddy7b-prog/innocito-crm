import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateUser, useUpdateUser } from '@/api/users';
import { apiErrorMessage } from '@/lib/api';
import { ROLE_NAMES } from '@/types';
import type { AppUser } from '@/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  roleName: z.enum(ROLE_NAMES as [string, ...string[]]),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(user?: AppUser | null): FormValues {
  return {
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    jobTitle: user?.jobTitle ?? '',
    roleName: user?.role?.name ?? 'INSIDE_SALES',
  };
}

export function UserFormDialog({
  user,
  open,
  onOpenChange,
  onCreated,
}: {
  user?: AppUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (temporaryPassword: string) => void;
}) {
  const isEdit = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(user),
  });

  useEffect(() => {
    if (open) reset(toDefaults(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit) {
        await updateUser.mutateAsync({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          jobTitle: values.jobTitle || undefined,
          roleName: values.roleName,
        });
        toast.success('User updated');
        onOpenChange(false);
      } else {
        const result = await createUser.mutateAsync({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          jobTitle: values.jobTitle || undefined,
          roleName: values.roleName,
        });
        toast.success(`User created — temporary password: ${result.temporaryPassword}`);
        onOpenChange(false);
        onCreated?.(result.temporaryPassword);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} user`));
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'New User'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update role and profile details. Changing the Email ID updates this user's login and the address every system notification is sent to."
              : 'Only Admins can create accounts — a temporary password will be generated automatically.'}
          </DialogDescription>
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
            <Label>Email *</Label>
            <Input type="email" {...register('email')} placeholder="jane.doe@innocito.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                This is the user's login and the address all notifications (lead assignments, status changes, alerts) go to. Changing it takes effect immediately and is recorded in the audit log.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Job Title</Label>
            <Input {...register('jobTitle')} placeholder="Account Executive" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Role *</Label>
            <Controller control={control} name="roleName" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_NAMES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create User'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
