import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, User, Shield, Building2, Mail, Send, Unlink, CalendarClock, RefreshCw, Plus, Trash2, Code2, Webhook, Copy, Check, ChevronDown, ChevronUp, Plug, Pencil, CreditCard, Monitor, LogOut } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { changePasswordRequest, listSessionsRequest, revokeSessionRequest, revokeOtherSessionsRequest } from '@/api/auth';
import { useMyOrganization, useUpdateMyOrganization } from '@/api/organizations';
import {
  useIntegrationsStatus,
  useDisconnectIntegration,
  useTestSendIntegration,
  connectProvider,
  type OAuthProvider,
} from '@/api/integrations';
import { useApiKeys, useRevokeApiKey, type ApiKey } from '@/api/apiKeys';
import { ApiKeyFormDialog } from './settings/ApiKeyFormDialog';
import {
  useWebhookEndpoints,
  useToggleWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useWebhookDeliveries,
  type WebhookEndpoint,
} from '@/api/webhooks';
import { WebhookFormDialog } from './settings/WebhookFormDialog';
import {
  useConnectorProviders,
  useConnectorInstances,
  useUpdateConnectorInstance,
  useDeleteConnectorInstance,
  type ConnectorInstance,
} from '@/api/connectors';
import { ConnectorFormDialog } from './settings/ConnectorFormDialog';
import {
  usePlans,
  useBillingSummary,
  useBillingInvoices,
  useCreateCheckoutSession,
  useCreatePortalSession,
  type PlanId,
} from '@/api/billing';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { initials, humanizeEnum, cn, formatDateTime } from '@/lib/utils';

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

      {/* Phase 11 (API/integrations), slice 1 — same "ADMIN by default" gate as
          ORGANIZATION_MANAGE above, not the OAuth-connection cards, which are ungated (personal,
          per-user actions). */}
      {hasPermission(PERMISSIONS.API_KEYS_MANAGE) && <ApiKeysCard />}

      {/* Phase 11 (API/integrations), slice 2 — same "ADMIN by default" gate as API_KEYS_MANAGE
          just above; see backend/src/utils/permissions.ts's WEBHOOKS_MANAGE comment. */}
      {hasPermission(PERMISSIONS.WEBHOOKS_MANAGE) && <WebhooksCard />}

      {/* Phase 11 (API/integrations), slice 3 — same "ADMIN by default" gate as the two cards
          above; see backend/src/utils/permissions.ts's CONNECTORS_MANAGE comment. */}
      {hasPermission(PERMISSIONS.CONNECTORS_MANAGE) && <ConnectorsCard />}

      {/* Phase 12 (billing/subscriptions) — same "ADMIN by default" gate as the cards above; see
          backend/src/utils/permissions.ts's BILLING_MANAGE comment. */}
      {hasPermission(PERMISSIONS.BILLING_MANAGE) && <BillingCard />}

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

      <SessionsCard />

      <p className="text-center text-xs text-muted-foreground">
        Need a new team member, role change, or password reset for someone else? Contact an Admin — self-service account creation within your organization is disabled by design.
      </p>
    </div>
  );
}

// Phase 15 (security hardening) — session/device management. Visible to any authenticated user,
// unconditionally, same "no permission gate — it's your own account" reasoning as
// ConnectedAccountsCard/Change Password above: everything here (list/revoke/revoke-others) is
// already scoped server-side to the caller's own userId (see backend/src/modules/auth/
// auth.service.ts), so there's nothing left to additionally gate client-side.
function SessionsCard() {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery({ queryKey: ['auth', 'sessions'], queryFn: listSessionsRequest });
  const revoke = useMutation({
    mutationFn: revokeSessionRequest,
    onSuccess: () => {
      toast.success('Session signed out');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to sign out that session')),
  });
  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessionsRequest,
    onSuccess: (result) => {
      toast.success(result.revokedCount > 0 ? `Signed out of ${result.revokedCount} other session(s)` : 'No other sessions to sign out of');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to sign out other sessions')),
  });

  // "Other" here means everything except the row this browser's own request identified as
  // `current` — never "everything but the most recently created row." Those aren't the same
  // thing: e.g. after refreshing on a second device, that device's session is now the newest row,
  // but THIS card, rendered in the FIRST device's browser, must still treat ITS OWN session as
  // the one to keep — which is exactly what the `current` flag (computed server-side from the
  // request's own refresh-token cookie, not from recency) guarantees.
  const otherCount = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Active Sessions</CardTitle>
        <CardDescription>Every device currently signed in as you. Don't recognize one? Sign it out.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState title="No active sessions" description="This shouldn't happen while you're looking at this page — try refreshing." />
        ) : (
          <>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{s.userAgent ?? 'Unknown device'}</p>
                      {s.current && <Badge variant="outline">This device</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress ?? 'Unknown location'} · signed in {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1 text-destructive hover:text-destructive"
                    onClick={() => revoke.mutate(s.id)}
                    loading={revoke.isPending}
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </Button>
                </div>
              ))}
            </div>
            {otherCount > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>
                  Sign out of {otherCount} other session{otherCount === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
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

// Phase 11 (API/integrations), slice 1 — ADMIN-only by default. Every key is read-only (see
// backend/src/db/schema.ts's apiKeys table comment); this card manages the credentials
// themselves (create/revoke), not what they're used for.
function ApiKeysCard() {
  const { data: keys, isLoading } = useApiKeys();
  const revokeApiKey = useRevokeApiKey();
  const [formOpen, setFormOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Code2 className="h-4 w-4" /> API Keys</CardTitle>
          <CardDescription>Read-only credentials for external integrations — sent as an <code>X-Api-Key</code> header, never a login.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}><Plus /> New Key</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !keys?.length ? (
          <p className="text-sm text-muted-foreground">No API keys yet. Create one to let an external tool read data from this organization.</p>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{k.name}</p>
                    {k.revokedAt ? (
                      <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>
                    ) : (
                      <Badge variant="outline" className="border-transparent bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</Badge>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground">{k.keyPrefix}••••••••••••••••••••••••••••••••••••••••••••••••••••••</code>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {k.permissions.length ? k.permissions.map((p) => <Badge key={p} variant="secondary">{p}</Badge>) : (
                      <span className="text-xs text-muted-foreground">No permissions granted</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(k.createdAt).toLocaleDateString()} · {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                  </p>
                </div>
                {!k.revokedAt && (
                  <Button variant="ghost" size="icon" onClick={() => setRevokeTarget(k)} aria-label={`Revoke ${k.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ApiKeyFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title={`Revoke "${revokeTarget?.name}"?`}
        description="Any tool using this key will immediately lose access. This can't be undone — create a new key if you need one again."
        destructive
        confirmLabel="Revoke Key"
        loading={revokeApiKey.isPending}
        onConfirm={async () => {
          if (!revokeTarget) return;
          try {
            await revokeApiKey.mutateAsync(revokeTarget.id);
            toast.success('API key revoked');
            setRevokeTarget(null);
          } catch (err) {
            toast.error(apiErrorMessage(err, 'Failed to revoke API key'));
          }
        }}
      />
    </Card>
  );
}

function WebhooksCard() {
  const { data: endpoints, isLoading } = useWebhookEndpoints();
  const toggleWebhook = useToggleWebhookEndpoint();
  const deleteWebhook = useDeleteWebhookEndpoint();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhooks</CardTitle>
          <CardDescription>POST a signed payload to your own URL when leads are created, updated, assigned, or change status.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}><Plus /> New Endpoint</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !endpoints?.length ? (
          <p className="text-sm text-muted-foreground">No webhook endpoints yet. Add one to have this app notify your own system when something happens to a lead.</p>
        ) : (
          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{endpoint.url}</p>
                      {endpoint.isActive ? (
                        <Badge variant="outline" className="border-transparent bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Paused</Badge>
                      )}
                    </div>
                    <WebhookSecret secret={endpoint.secret} />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {endpoint.eventTypes.map((e) => <Badge key={e} variant="secondary"><code>{e}</code></Badge>)}
                    </div>
                    <p className="text-xs text-muted-foreground">Created {new Date(endpoint.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={endpoint.isActive}
                      disabled={toggleWebhook.isPending}
                      onCheckedChange={(checked) =>
                        toggleWebhook.mutate(
                          { id: endpoint.id, isActive: checked },
                          { onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update webhook endpoint')) }
                        )
                      }
                      aria-label={endpoint.isActive ? `Pause ${endpoint.url}` : `Resume ${endpoint.url}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === endpoint.id ? null : endpoint.id)} aria-label="Toggle delivery history">
                      {expandedId === endpoint.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(endpoint)} aria-label={`Delete ${endpoint.url}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expandedId === endpoint.id && <WebhookDeliveriesList endpointId={endpoint.id} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <WebhookFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this webhook endpoint?"
        description="Its delivery history is deleted along with it. Any tool relying on these notifications will stop receiving them immediately. This can't be undone."
        destructive
        confirmLabel="Delete Endpoint"
        loading={deleteWebhook.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteWebhook.mutateAsync(deleteTarget.id);
            toast.success('Webhook endpoint deleted');
            setDeleteTarget(null);
          } catch (err) {
            toast.error(apiErrorMessage(err, 'Failed to delete webhook endpoint'));
          }
        }}
      />
    </Card>
  );
}

/** Not a one-time reveal (see api/webhooks.ts) — just a copyable field, same treatment as any
 * other endpoint detail. */
function WebhookSecret({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success('Signing secret copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the secret manually");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs text-muted-foreground">{secret}</code>
      <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} aria-label="Copy signing secret">
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function WebhookDeliveriesList({ endpointId }: { endpointId: string }) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(endpointId);

  const statusBadge = (status: string) => {
    if (status === 'SUCCEEDED') return <Badge variant="outline" className="border-transparent bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Succeeded</Badge>;
    if (status === 'FAILED') return <Badge variant="outline" className="border-transparent bg-red-100 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">Failed</Badge>;
    return <Badge variant="outline" className="border-transparent bg-amber-100 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Pending retry</Badge>;
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent deliveries</p>
      {isLoading ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : !deliveries?.length ? (
        <p className="text-xs text-muted-foreground">No deliveries yet — they'll show up here the next time a subscribed event happens.</p>
      ) : (
        <div className="space-y-1.5">
          {deliveries.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <code>{d.eventType}</code>
                {statusBadge(d.status)}
                <span className="text-muted-foreground">
                  {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                  {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}
                </span>
              </div>
              <span className="text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectorsCard() {
  const { data: providers } = useConnectorProviders();
  const { data: instances, isLoading } = useConnectorInstances();
  const updateConnector = useUpdateConnectorInstance();
  const deleteConnector = useDeleteConnectorInstance();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectorInstance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectorInstance | null>(null);

  function providerName(providerId: string) {
    return providers?.find((p) => p.id === providerId)?.name ?? providerId;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connectors</CardTitle>
          <CardDescription>Groundwork for third-party integrations (Slack, HubSpot, Zoom) — stores config for a provider; no live integration is wired up yet.</CardDescription>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> New Connector</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !instances?.length ? (
          <p className="text-sm text-muted-foreground">No connectors configured yet.</p>
        ) : (
          <div className="space-y-3">
            {instances.map((instance) => (
              <div key={instance.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{instance.name}</p>
                    <Badge variant="outline">{providerName(instance.providerId)}</Badge>
                    {instance.isActive ? (
                      <Badge variant="outline" className="border-transparent bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Paused</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                    {Object.entries(instance.config).map(([key, value]) => (
                      <span key={key}><code>{key}</code>: {value || '—'}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={instance.isActive}
                    disabled={updateConnector.isPending}
                    onCheckedChange={(checked) =>
                      updateConnector.mutate(
                        { id: instance.id, isActive: checked },
                        { onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update connector')) }
                      )
                    }
                    aria-label={instance.isActive ? `Pause ${instance.name}` : `Resume ${instance.name}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(instance); setFormOpen(true); }} aria-label={`Edit ${instance.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(instance)} aria-label={`Delete ${instance.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConnectorFormDialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }} editing={editing} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Its stored config is deleted along with it. This can't be undone."
        destructive
        confirmLabel="Delete Connector"
        loading={deleteConnector.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteConnector.mutateAsync(deleteTarget.id);
            toast.success('Connector deleted');
            setDeleteTarget(null);
          } catch (err) {
            toast.error(apiErrorMessage(err, 'Failed to delete connector'));
          }
        }}
      />
    </Card>
  );
}

function BillingCard() {
  const { data: summary, isLoading } = useBillingSummary();
  const { data: plans } = usePlans();
  const { data: invoicesList } = useBillingInvoices();
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();
  const [invoicesOpen, setInvoicesOpen] = useState(false);

  function goToCheckout(planId: PlanId) {
    createCheckout.mutate(planId, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start checkout')),
    });
  }

  function openPortal() {
    createPortal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to open billing portal')),
    });
  }

  const currentPlanId = summary?.plan.id;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Billing</CardTitle>
          <CardDescription>
            {summary && !summary.billingEnabled
              ? "Stripe isn't configured on this server yet — every organization stays on the Free plan until an operator sets it up."
              : "Manage your plan, usage, and invoices."}
          </CardDescription>
        </div>
        {summary?.subscription.hasStripeCustomer && (
          <Button size="sm" variant="outline" onClick={openPortal} disabled={createPortal.isPending}>Manage Billing</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !summary ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Current plan: {summary.plan.name}</p>
              <Badge variant="outline">{humanizeEnum(summary.subscription.status)}</Badge>
              {summary.subscription.cancelAtPeriodEnd && (
                <Badge variant="outline" className="text-muted-foreground">Cancels at period end</Badge>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Users</span>
                  <span>{summary.usage.users.used}{summary.usage.users.limit != null ? ` / ${summary.usage.users.limit}` : ' (unlimited)'}</span>
                </div>
                {summary.usage.users.limit != null && (
                  <Progress value={Math.min(100, (summary.usage.users.used / summary.usage.users.limit) * 100)} />
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Leads</span>
                  <span>{summary.usage.leads.used}{summary.usage.leads.limit != null ? ` / ${summary.usage.leads.limit}` : ' (unlimited)'}</span>
                </div>
                {summary.usage.leads.limit != null && (
                  <Progress value={Math.min(100, (summary.usage.leads.used / summary.usage.leads.limit) * 100)} />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {plans?.map((plan) => (
                <div key={plan.id} className={cn('space-y-2 rounded-lg border p-3', plan.id === currentPlanId ? 'border-primary' : 'border-border/60')}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{plan.name}</p>
                    {plan.id === currentPlanId && <Badge variant="outline">Current</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.monthlyPriceUsd == null ? 'Custom pricing' : plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd}/mo`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.maxUsers ?? 'Unlimited'} users · {plan.maxLeads ?? 'Unlimited'} leads
                  </p>
                  {plan.id !== currentPlanId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={createCheckout.isPending || !plan.priceId}
                      onClick={() => goToCheckout(plan.id)}
                    >
                      {plan.priceId ? 'Upgrade' : 'Contact Sales'}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!!invoicesList?.length && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setInvoicesOpen((o) => !o)}
                >
                  {invoicesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Invoice history ({invoicesList.length})
                </button>
                {invoicesOpen && (
                  <div className="space-y-1.5">
                    {invoicesList.map((invoice) => (
                      <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-xs">
                        <span>{new Date(invoice.createdAt).toLocaleDateString()}</span>
                        <span>{(invoice.amountPaidCents / 100).toLocaleString('en-US', { style: 'currency', currency: invoice.currency.toUpperCase() })}</span>
                        <Badge variant="outline">{humanizeEnum(invoice.status)}</Badge>
                        {invoice.hostedInvoiceUrl && (
                          <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
