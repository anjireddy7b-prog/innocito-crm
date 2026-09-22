import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CustomFieldsSection } from '@/components/shared/CustomFieldsSection';
import { useCustomFieldDefinitions } from '@/api/customFields';
import {
  useCreateCustomObjectRecord,
  useUpdateCustomObjectRecord,
  type CustomObjectDefinition,
  type CustomObjectRecord,
} from '@/api/customObjects';
import { apiErrorMessage } from '@/lib/api';

/**
 * Phase 5: create/edit dialog for a single record of a custom object. A record has no typed
 * columns of its own — its entire content is the dynamic field set defined on this object (see
 * customObjects.service.ts's createCustomObjectRecord) — so this dialog is just a thin shell
 * around the exact CustomFieldsSection built for leads in Phase 4, driven by this object's own
 * key as `entityType`, with plain useState instead of react-hook-form since there's nothing else
 * on the form to validate client-side (the server re-validates every value against the field
 * definitions regardless).
 */
export function CustomObjectRecordFormDialog({
  definition,
  record,
  open,
  onOpenChange,
}: {
  definition: CustomObjectDefinition;
  record?: CustomObjectRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!record;
  const { data: fieldDefinitions, isLoading: fieldsLoading } = useCustomFieldDefinitions(definition.key);
  const createRecord = useCreateCustomObjectRecord(definition.id);
  const updateRecord = useUpdateCustomObjectRecord(definition.id, record?.id ?? '');
  const [data, setData] = useState<Record<string, unknown>>(record?.data ?? {});

  useEffect(() => {
    if (open) setData(record?.data ?? {});
  }, [open, record]);

  async function onSubmit() {
    try {
      if (isEdit) {
        await updateRecord.mutateAsync({ data });
        toast.success(`${definition.singularLabel} updated`);
      } else {
        await createRecord.mutateAsync({ data });
        toast.success(`${definition.singularLabel} created`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} ${definition.singularLabel}`));
    }
  }

  const isPending = createRecord.isPending || updateRecord.isPending;
  const hasNoFields = !fieldsLoading && (!fieldDefinitions || fieldDefinitions.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${definition.singularLabel}` : `New ${definition.singularLabel}`}</DialogTitle>
          <DialogDescription>
            {hasNoFields
              ? `${definition.singularLabel} has no fields defined yet — add some from this object's Fields tab first.`
              : `Fill in ${definition.singularLabel}'s fields.`}
          </DialogDescription>
        </DialogHeader>

        {!hasNoFields && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CustomFieldsSection entityType={definition.key} value={data} onChange={setData} hideHeading />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSubmit} loading={isPending} disabled={hasNoFields}>
            {isEdit ? 'Save Changes' : `Create ${definition.singularLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
