import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useRoles, useDeleteRole, type Role } from '@/api/roles';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { RoleFormDialog } from '@/pages/roles/RoleFormDialog';

/**
 * Phase 3: roles moved from a fixed, platform-wide list of 5 to this organization's own,
 * admin-editable set (see the Architecture Report and backend migrations 0011-0013). This page
 * is what actually makes that editable — before it existed, ROLES_MANAGE had nothing to attach
 * to in the UI even though the API already supported it.
 */
export default function RolesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.ROLES_MANAGE);
  const { data: roles, isLoading } = useRoles();
  const deleteRole = useDeleteRole();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const columns: DataTableColumn<Role>[] = [
    { key: 'name', header: 'Role', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'description', header: 'Description', cell: (r) => r.description ?? '—' },
    { key: 'permissions', header: 'Permissions', cell: (r) => <Badge variant="outline">{r.permissions.length} granted</Badge> },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditRole(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles & Permissions"
        description="Each role grants a specific set of permissions. Editing a role changes access immediately for everyone assigned to it."
        actions={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus /> New Role</Button> : undefined}
      />

      <DataTable columns={columns} data={roles ?? []} isLoading={isLoading} rowKey={(r) => r.id} emptyTitle="No roles found" />

      {canManage && (
        <>
          <RoleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
          <RoleFormDialog role={editRole} open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)} />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={`Delete ${deleteTarget?.name}?`}
            description="This cannot be undone. If anyone is still assigned to this role, move them to another role first."
            destructive
            confirmLabel="Delete Role"
            loading={deleteRole.isPending}
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteRole.mutateAsync(deleteTarget.id);
                toast.success('Role deleted');
                setDeleteTarget(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, 'Failed to delete role'));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
