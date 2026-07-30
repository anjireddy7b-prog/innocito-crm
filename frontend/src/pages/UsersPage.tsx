import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useUsers, useResetUserPassword } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { api, apiErrorMessage } from '@/lib/api';
import { initials, formatDate, humanizeEnum } from '@/lib/utils';
import type { AppUser } from '@/types';
import { UserFormDialog } from '@/pages/users/UserFormDialog';

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const { data, isLoading } = useUsers({ pageSize: 100 });
  const queryClient = useQueryClient();
  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/users/${id}/active`, { isActive });
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'User enabled' : 'User disabled — active sessions revoked');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update user status')),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [disableUser, setDisableUser] = useState<AppUser | null>(null);

  const columns: DataTableColumn<AppUser>[] = [
    {
      key: 'name',
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8"><AvatarFallback>{initials(u.firstName, u.lastName)}</AvatarFallback></Avatar>
          <div>
            <p className="font-medium">{u.firstName} {u.lastName}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (u) => <Badge variant="outline">{humanizeEnum(u.role.name)}</Badge> },
    { key: 'jobTitle', header: 'Job Title', cell: (u) => u.jobTitle ?? '—' },
    { key: 'lastLoginAt', header: 'Last Login', cell: (u) => formatDate(u.lastLoginAt) },
    {
      key: 'active',
      header: 'Active',
      cell: (u) => (
        <Switch
          checked={u.isActive}
          disabled={u.id === currentUser?.id}
          onCheckedChange={(checked) => {
            if (!checked) {
              setDisableUser(u);
              return;
            }
            setActive.mutate({ id: u.id, isActive: true });
          }}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditUser(u)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setResetUser(u)}><KeyRound className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Only Admins can create accounts, assign roles, reset passwords, and enable or disable users."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New User
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(u) => u.id}
        emptyTitle="No users found"
      />

      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <UserFormDialog user={editUser} open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)} />

      <ConfirmDialog
        open={!!disableUser}
        onOpenChange={(o) => !o && setDisableUser(null)}
        title={`Disable ${disableUser?.firstName}?`}
        description="This immediately revokes their active session. They will no longer be able to sign in until re-enabled."
        destructive
        confirmLabel="Disable User"
        loading={setActive.isPending}
        onConfirm={() => {
          if (disableUser) setActive.mutate({ id: disableUser.id, isActive: false });
          setDisableUser(null);
        }}
      />

      <ResetPasswordDialog user={resetUser} onOpenChange={(o) => !o && setResetUser(null)} />
    </div>
  );
}

function ResetPasswordDialog({ user, onOpenChange }: { user: AppUser | null; onOpenChange: (open: boolean) => void }) {
  const resetPassword = useResetUserPassword(user?.id ?? '');

  return (
    <ConfirmDialog
      open={!!user}
      onOpenChange={onOpenChange}
      title={`Reset password for ${user?.firstName}?`}
      description="A new temporary password will be generated. The user must change it on next login."
      confirmLabel="Reset Password"
      loading={resetPassword.isPending}
      onConfirm={async () => {
        try {
          const result = await resetPassword.mutateAsync();
          toast.success(`Temporary password: ${result.temporaryPassword}`, { duration: 15000 });
        } catch (err) {
          toast.error(apiErrorMessage(err, 'Failed to reset password'));
        } finally {
          onOpenChange(false);
        }
      }}
    />
  );
}
