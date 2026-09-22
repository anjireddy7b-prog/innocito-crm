import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useCustomFieldDefinitions } from '@/api/customFields';
import { useCustomObjectRecords, useDeleteCustomObjectRecord, type CustomObjectDefinition, type CustomObjectRecord } from '@/api/customObjects';
import { apiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CustomObjectRecordFormDialog } from './CustomObjectRecordFormDialog';

// A record's columns are driven entirely by this object's OWN field definitions (there are no
// typed columns to fall back to — see customObjects.service.ts) — capped at the first 5 so a
// heavily-fielded object doesn't blow out the table width; the record's full data is still
// editable via the row's edit dialog regardless of how many fields are shown here.
const MAX_COLUMNS = 5;

function renderCellValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function CustomObjectRecordsTab({
  definition,
  canManage,
  onManageFields,
}: {
  definition: CustomObjectDefinition;
  canManage: boolean;
  onManageFields: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data: fieldDefinitions } = useCustomFieldDefinitions(definition.key);
  const { data, isLoading } = useCustomObjectRecords(definition.id, { page, pageSize: 25 });
  const deleteRecord = useDeleteCustomObjectRecord(definition.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<CustomObjectRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomObjectRecord | null>(null);

  const hasNoFields = fieldDefinitions !== undefined && fieldDefinitions.length === 0;
  const shownFields = (fieldDefinitions ?? []).slice(0, MAX_COLUMNS);

  const columns: DataTableColumn<CustomObjectRecord>[] = [
    ...shownFields.map((f): DataTableColumn<CustomObjectRecord> => ({
      key: f.key,
      header: f.label,
      cell: (r) => (f.fieldType === 'DATE' ? formatDate(r.data[f.key] as string | undefined) : renderCellValue(r.data[f.key])),
    })),
    {
      key: 'createdAt',
      header: 'Created',
      cell: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditRecord(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    });
  }

  if (hasNoFields) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {definition.singularLabel} has no fields defined yet.{' '}
          <button type="button" onClick={onManageFields} className="font-medium text-primary hover:underline">
            Add fields
          </button>{' '}
          before creating records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Records of {definition.pluralLabel.toLowerCase()}, one row per {definition.singularLabel.toLowerCase()}.</p>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus /> New {definition.singularLabel}</Button>}
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyTitle={`No ${definition.pluralLabel.toLowerCase()} yet`}
        emptyDescription={`Create the first ${definition.singularLabel.toLowerCase()} to get started.`}
      />

      {data?.meta && (
        <Pagination page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} totalPages={data.meta.totalPages} onPageChange={setPage} />
      )}

      {canManage && (
        <>
          <CustomObjectRecordFormDialog definition={definition} open={createOpen} onOpenChange={setCreateOpen} />
          <CustomObjectRecordFormDialog
            definition={definition}
            record={editRecord}
            open={!!editRecord}
            onOpenChange={(o) => !o && setEditRecord(null)}
          />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={`Delete this ${definition.singularLabel.toLowerCase()}?`}
            description="This can't be undone."
            destructive
            confirmLabel="Delete"
            loading={deleteRecord.isPending}
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteRecord.mutateAsync(deleteTarget.id);
                toast.success(`${definition.singularLabel} deleted`);
                setDeleteTarget(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, `Failed to delete ${definition.singularLabel.toLowerCase()}`));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
