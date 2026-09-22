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
import { useRoles } from '@/api/roles';
import { apiErrorMessage } from '@/lib/api';
import type { AppUser } from '@/types';

// Phase 3: roles are tenant-scoped, admin-editable data, so the picker below is driven by this
// organization's actual /roles list (useRoles()) rather than the old fixed ROLE_NAMES array — an
// Admin can rename or add roles and this form picks them up with no code change. The role is
// selected and submitted by id, not by name, since names are no longer guaranteed unique across
// organizations (or even meaningful as a fixed set within one, once custom roles exist).
const schema = z.object({
  email: z.string().email('Enter a valid email'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  roleId: z.string().min(1, 'Select a role'),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(user?: AppUser | null): FormValues {
  return {
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    jobTitle: user?.jobTitle ?? '',
    roleId: user?.role?.id ?? '',
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
  const { data: roles } = useRoles();

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
          roleId: values.roleId,
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
          roleId: values.roleId,
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
            <Input type="email" {...register('email')} placeholder="jane.doe@sdrreachout.com" />
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
            <Controller control={control} name="roleId" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
            {errors.roleId && <p className="text-xs text-destructive">{errors.roleId.message}</p>}
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
