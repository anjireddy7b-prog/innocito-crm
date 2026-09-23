import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, User, Shield, Building2, Mail, Send, Unlink, CalendarClock, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { changePasswordRequest } from '@/api/auth';
import { useMyOrganization, useUpdateMyOrganization } from '@/api/organizations';
import {
  useIntegrationsStatus,
  useDisconnectIntegration,
  useTestSendIntegration,
  connectProvider,
  type OAuthProvider,
} from '@/api/integrations';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
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
  const hasPermission = useAuthStore((s) => s.hasPermission);

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

      {/* Phase 3: was user?.role === 'ADMIN' — ORGANIZATION_MANAGE is granted to ADMIN by
          default (see backend/src/utils/permissions.ts), the same permission this section's own
          PATCH /organizations/me route is now gated by. */}
      {hasPermission(PERMISSIONS.ORGANIZATION_MANAGE) && <OrganizationCard />}

      <ConnectedAccountsCard />

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

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
// connection infrastructure only; the sequences engine itself is a later slice built on top of
// this, so this card only manages the connection — sending sequence emails as it isn't wired up
// yet). Visible to any authenticated user, unconditionally — connecting/disconnecting one's own
// mailbox needs no permission grant, same as the rest of this page's Profile/Change Password
// sections. Either provider stays disabled here until an Admin sets its three env vars on the
// server (see backend/.env.example) — mirrors how the shared SMTP address is already an env-only
// switch nobody configures from this UI.
function ConnectedAccountsCard() {
  const [params, setParams] = useSearchParams();
  const { data: status, isLoading } = useIntegrationsStatus();
  const disconnect = useDisconnectIntegration();
  const testSend = useTestSendIntegration();
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    const connected = params.get('connected');
    if (!connected) return;
    if (connected === 'error') {
      const provider = params.get('provider');
      toast.error(`Failed to connect${provider ? ` ${humanizeEnum(provider)}` : ''} — please try again.`);
    } else {
      toast.success(`Connected ${humanizeEnum(connected)} successfully`);
    }
    const next = new URLSearchParams(params);
    next.delete('connected');
    next.delete('provider');
    setParams(next, { replace: true });
    // Only ever meant to run once per redirect-back — re-running on every params change would
    // re-fire the toast the moment the cleanup call above updates params itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(provider: OAuthProvider) {
    setConnecting(provider);
    try {
      await connectProvider(provider); // full-page navigation away — see integrations.ts
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to start ${humanizeEnum(provider)} connection`));
      setConnecting(null);
    }
  }

  function handleDisconnect() {
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success('Disconnected'),
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to disconnect')),
    });
  }

  function handleTestSend() {
    testSend.mutate(undefined, {
      onSuccess: () => toast.success('Test email sent — check your inbox'),
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to send test email')),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Connected Accounts</CardTitle>
        <CardDescription>Connect your own mailbox so outgoing emails are sent as you, and your meetings sync to your calendar, instead of staying CRM-only.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : status?.connection ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Connected as {status.connection.emailAddress}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{humanizeEnum(status.connection.provider)}</Badge>
                  {status.connection.calendarScopeGranted ? (
                    <Badge variant="outline" className="border-transparent bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <CalendarClock className="mr-1 h-3 w-3" /> Calendar sync on
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-amber-100 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Calendar sync not enabled
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestSend} loading={testSend.isPending}>
                  <Send /> Send test email
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect} loading={disconnect.isPending}>
                  <Unlink /> Disconnect
                </Button>
              </div>
            </div>
            {!status.connection.calendarScopeGranted && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  This connection was made before calendar sync existed — reconnect once to also sync your meetings to {humanizeEnum(status.connection.provider)} Calendar.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConnect(status.connection!.provider)}
                  loading={connecting === status.connection.provider}
                >
                  <RefreshCw /> Reconnect
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleConnect('GOOGLE')}
                disabled={!status?.google.configured}
                loading={connecting === 'GOOGLE'}
              >
                Connect Google
              </Button>
              <Button
                variant="outline"
                onClick={() => handleConnect('MICROSOFT')}
                disabled={!status?.microsoft.configured}
                loading={connecting === 'MICROSOFT'}
              >
                Connect Microsoft
              </Button>
            </div>
            {(!status?.google.configured || !status?.microsoft.configured) && (
              <p className="text-xs text-muted-foreground">
                {!status?.google.configured && !status?.microsoft.configured
                  ? "Neither provider is configured on this server yet — ask your Admin to set it up."
                  : `${!status?.google.configured ? 'Google' : 'Microsoft'} isn't configured on this server yet.`}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Without a connection, outgoing emails use the shared address configured for this organization, and your meetings stay CRM-only (not synced to a calendar).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
