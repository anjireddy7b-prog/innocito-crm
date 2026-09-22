import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, User, Shield, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { changePasswordRequest } from '@/api/auth';
import { useMyOrganization, useUpdateMyOrganization } from '@/api/organizations';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/api';
import { initials, humanizeEnum } from '@/lib/utils';

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormValues = z.infer<typeof schema>;

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(200),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(63, 'Slug must be at most 63 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only'),
});
type OrgFormValues = z.infer<typeof orgSchema>;

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const changePassword = useMutation({
    mutationFn: (values: FormValues) => changePasswordRequest(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success('Password updated successfully');
      reset();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to change password')),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Manage your profile and account security." />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> Profile</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-14 w-14 text-lg"><AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback></Avatar>
          <div>
            <p className="text-lg font-semibold">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <Badge variant="outline" className="mt-1 inline-flex items-center gap-1"><Shield className="h-3 w-3" />{humanizeEnum(user?.role)}</Badge>
          </div>
        </CardContent>
      </Card>

      {user?.role === 'ADMIN' && <OrganizationCard />}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => changePassword.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" {...register('currentPassword')} />
              {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" {...register('newPassword')} />
              {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" {...register('confirmPassword')} />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={changePassword.isPending}>Update Password</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Need a new team member, role change, or password reset for someone else? Contact an Admin — self-service account creation within your organization is disabled by design.
      </p>
    </div>
  );
}

// ADMIN-only. Phase 2: now that self-service signup means more than one real organization can
// exist, its own Admin needs a way to rename it or change its URL slug without asking anyone
// else — this is the one place that happens.
function OrganizationCard() {
  const { data: organization, isLoading } = useMyOrganization();
  const updateOrganization = useUpdateMyOrganization();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
  });

  useEffect(() => {
    if (organization) reset({ name: organization.name, slug: organization.slug });
  }, [organization, reset]);

  function onSubmit(values: OrgFormValues) {
    updateOrganization.mutate(values, {
      onSuccess: (updated) => {
        toast.success('Organization updated');
        reset({ name: updated.name, slug: updated.slug });
      },
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update organization')),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Organization</CardTitle>
        <CardDescription>Only visible to Admins. Changing the URL slug does not affect any existing data.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organization name</Label>
              <Input id="orgName" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgSlug">URL slug</Label>
              <Input id="orgSlug" {...register('slug')} />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!isDirty} loading={updateOrganization.isPending}>Save Changes</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
