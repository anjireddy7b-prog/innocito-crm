import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useCustomFieldDefinitions, useDeleteCustomFieldDefinition, type CustomFieldDefinition } from '@/api/customFields';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';
import { CustomFieldFormDialog } from './CustomFieldFormDialog';

// Phase 5: `entityType` is now a prop (default 'LEAD', unchanged for the Customization page's own
// "Custom Fields" tab) so this exact component also renders a custom object's own field list —
// see CustomObjectDetailPage.tsx, which passes the object's `key`.
export function CustomFieldsTab({ canManage, entityType = 'LEAD' }: { canManage: boolean; entityType?: string }) {
  const { data: fields, isLoading } = useCustomFieldDefinitions(entityType);
  const deleteField = useDeleteCustomFieldDefinition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editField, setEditField] = useState<CustomFieldDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null);

  const columns: DataTableColumn<CustomFieldDefinition>[] = [
    { key: 'label', header: 'Field', cell: (f) => <span className="font-medium">{f.label}</span> },
    { key: 'key', header: 'Key', cell: (f) => <code className="text-xs text-muted-foreground">{f.key}</code> },
    { key: 'fieldType', header: 'Type', cell: (f) => <Badge variant="outline">{humanizeEnum(f.fieldType)}</Badge> },
    {
      // Phase 6: which named group (if any) this field renders under on its form — see
      // CustomFieldsSection.tsx.
      key: 'section',
      header: 'Section',
      cell: (f) => (f.section ? <span className="text-sm">{f.section}</span> : <span className="text-sm text-muted-foreground">—</span>),
    },
    { key: 'required', header: 'Required', cell: (f) => (f.required ? 'Yes' : '—') },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (f) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditField(f)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(f)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Extra fields shown on every Lead creation and edit form, in addition to the built-in fields.
        </p>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus /> New Field</Button>}
      </div>

      <DataTable
        columns={columns}
        data={fields ?? []}
        isLoading={isLoading}
        rowKey={(f) => f.id}
        emptyTitle="No custom fields yet"
        emptyDescription="Create one to start collecting extra information on every lead."
      />

      {canManage && (
        <>
          <CustomFieldFormDialog entityType={entityType} open={createOpen} onOpenChange={setCreateOpen} />
          <CustomFieldFormDialog entityType={entityType} field={editField} open={!!editField} onOpenChange={(o) => !o && setEditField(null)} />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={`Delete ${deleteTarget?.label}?`}
            description="Existing leads keep whatever value they already have for this field, but it will no longer be shown or editable anywhere."
            destructive
            confirmLabel="Delete Field"
            loading={deleteField.isPending}
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteField.mutateAsync(deleteTarget.id);
                toast.success('Custom field deleted');
                setDeleteTarget(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, 'Failed to delete custom field'));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
