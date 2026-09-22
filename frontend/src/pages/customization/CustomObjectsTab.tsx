import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useCustomObjectDefinitions, useDeleteCustomObjectDefinition, type CustomObjectDefinition } from '@/api/customObjects';
import { apiErrorMessage } from '@/lib/api';
import { CustomObjectDefinitionFormDialog } from './CustomObjectDefinitionFormDialog';

/**
 * Phase 5: lists the org's tenant-defined custom object types. Managing a given object's own
 * fields and browsing/editing its records both happen one level down, on
 * CustomObjectDetailPage.tsx (reached via the row's "Manage" action) — this tab only owns the
 * object type itself (key/labels/description) plus delete.
 */
export function CustomObjectsTab({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const { data: definitions, isLoading } = useCustomObjectDefinitions();
  const deleteDefinition = useDeleteCustomObjectDefinition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editDefinition, setEditDefinition] = useState<CustomObjectDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomObjectDefinition | null>(null);

  const columns: DataTableColumn<CustomObjectDefinition>[] = [
    { key: 'singularLabel', header: 'Object', cell: (d) => <span className="font-medium">{d.singularLabel}</span> },
    { key: 'key', header: 'Key', cell: (d) => <code className="text-xs text-muted-foreground">{d.key}</code> },
    { key: 'pluralLabel', header: 'Plural', cell: (d) => d.pluralLabel },
    { key: 'description', header: 'Description', cell: (d) => <span className="text-sm text-muted-foreground">{d.description || '—'}</span> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/objects/${d.id}`)}>
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="icon" onClick={() => setEditDefinition(d)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d)}><Trash2 className="h-4 w-4" /></Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Tenant-defined entities with their own fields and records, separate from Leads/Companies/Contacts.
        </p>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus /> New Object</Button>}
      </div>

      <DataTable
        columns={columns}
        data={definitions ?? []}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/objects/${d.id}`)}
        emptyTitle="No custom objects yet"
        emptyDescription="Create one to start tracking a brand-new kind of record for your team."
      />

      {canManage && (
        <>
          <CustomObjectDefinitionFormDialog open={createOpen} onOpenChange={setCreateOpen} />
          <CustomObjectDefinitionFormDialog
            definition={editDefinition}
            open={!!editDefinition}
            onOpenChange={(o) => !o && setEditDefinition(null)}
          />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={`Delete ${deleteTarget?.singularLabel}?`}
            description="This permanently deletes every record of this type, along with its field definitions. This can't be undone."
            destructive
            confirmLabel="Delete Object"
            loading={deleteDefinition.isPending}
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteDefinition.mutateAsync(deleteTarget.id);
                toast.success('Custom object deleted');
                setDeleteTarget(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, 'Failed to delete custom object'));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
