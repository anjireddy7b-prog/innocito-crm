import { useEffect } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCustomFieldDefinition, useUpdateCustomFieldDefinition, CUSTOM_FIELD_TYPES, type CustomFieldDefinition } from '@/api/customFields';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';

const CHOICE_TYPES = ['SELECT', 'MULTI_SELECT'];

// key is immutable after creation (see the backend validation.ts comment — renaming it would
// orphan values already stored in existing leads' customFields bags), so it's only collected on
// create and shown read-only on edit.
const createSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Key is required')
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers, and underscores, starting with a letter'),
  label: z.string().trim().min(1, 'Label is required').max(200),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  optionsText: z.string().optional(),
  required: z.boolean(),
});
type FormValues = z.infer<typeof createSchema>;

function toDefaults(field?: CustomFieldDefinition | null): FormValues {
  return {
    key: field?.key ?? '',
    label: field?.label ?? '',
    fieldType: field?.fieldType ?? 'TEXT',
    optionsText: field?.options?.join('\n') ?? '',
    required: field?.required ?? false,
  };
}

/**
 * Phase 4: create/edit dialog for a LEAD custom field definition. Options for SELECT/MULTI_SELECT
 * are entered one per line and split/trimmed client-side — the backend stores (and re-validates)
 * them as a plain string array (see customFields.validation.ts).
 */
export function CustomFieldFormDialog({
  field,
  open,
  onOpenChange,
}: {
  field?: CustomFieldDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!field;
  const createField = useCreateCustomFieldDefinition();
  const updateField = useUpdateCustomFieldDefinition(field?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: toDefaults(field),
  });

  useEffect(() => {
    if (open) reset(toDefaults(field));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field?.id]);

  const fieldType = useWatch({ control, name: 'fieldType' });
  const isChoiceType = CHOICE_TYPES.includes(fieldType);

  async function onSubmit(values: FormValues) {
    const options = isChoiceType
      ? values.optionsText
          ?.split('\n')
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined;

    if (isChoiceType && (!options || options.length === 0)) {
      toast.error('Add at least one option for a Select / Multi-select field');
      return;
    }

    try {
      if (isEdit) {
        await updateField.mutateAsync({ label: values.label, options: options ?? null, required: values.required });
        toast.success('Custom field updated');
      } else {
        await createField.mutateAsync({
          key: values.key,
          label: values.label,
          fieldType: values.fieldType,
          options: options ?? null,
          required: values.required,
        });
        toast.success('Custom field created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} custom field`));
    }
  }

  const isPending = createField.isPending || updateField.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${field?.label}` : 'New Custom Field'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Renaming or re-configuring this field applies immediately on every lead form.'
              : 'Adds a new field to the Lead creation and edit forms for everyone in your organization.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Label *</Label>
            <Input {...register('label')} placeholder="Deal Size" />
            {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Key *</Label>
            <Input {...register('key')} placeholder="deal_size" disabled={isEdit} />
            {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
            {isEdit && <p className="text-xs text-muted-foreground">The key can&apos;t be changed after creation.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Field Type *</Label>
            <Controller
              control={control}
              name="fieldType"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{humanizeEnum(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {isEdit && <p className="text-xs text-muted-foreground">The field type can&apos;t be changed after creation.</p>}
          </div>

          {isChoiceType && (
            <div className="space-y-1.5">
              <Label>Options (one per line) *</Label>
              <textarea
                {...register('optionsText')}
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                placeholder={'Small\nMedium\nLarge'}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="required"
              render={({ field: f }) => <Checkbox checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />}
            />
            Required on every new lead
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Field'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
