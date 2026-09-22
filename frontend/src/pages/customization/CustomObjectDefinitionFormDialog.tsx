import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateCustomObjectDefinition,
  useUpdateCustomObjectDefinition,
  type CustomObjectDefinition,
} from '@/api/customObjects';
import { apiErrorMessage } from '@/lib/api';

// key is immutable after creation (mirrors the same rule on a custom FIELD's key, and for the
// same reason: every field definition and record that points at this object via its key would be
// orphaned by a rename) — collected only on create, shown read-only on edit.
const createSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Key is required')
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers, and underscores, starting with a letter')
    .refine((k) => k !== 'lead', { message: '"lead" is reserved for the built-in Lead entity' }),
  singularLabel: z.string().trim().min(1, 'Singular label is required').max(150),
  pluralLabel: z.string().trim().min(1, 'Plural label is required').max(150),
  description: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof createSchema>;

function toDefaults(definition?: CustomObjectDefinition | null): FormValues {
  return {
    key: definition?.key ?? '',
    singularLabel: definition?.singularLabel ?? '',
    pluralLabel: definition?.pluralLabel ?? '',
    description: definition?.description ?? '',
  };
}

/**
 * Phase 5: create/edit dialog for a tenant-defined custom object type (e.g. "Project", plural
 * "Projects"). Creating one here only defines the *shape* — its own fields are added afterward on
 * CustomObjectDetailPage.tsx's Fields tab, reusing the exact CustomFieldsTab/CustomFieldFormDialog
 * built for leads in Phase 4.
 */
export function CustomObjectDefinitionFormDialog({
  definition,
  open,
  onOpenChange,
}: {
  definition?: CustomObjectDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!definition;
  const createDefinition = useCreateCustomObjectDefinition();
  const updateDefinition = useUpdateCustomObjectDefinition(definition?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: toDefaults(definition),
  });

  useEffect(() => {
    if (open) reset(toDefaults(definition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, definition?.id]);

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit) {
        await updateDefinition.mutateAsync({
          singularLabel: values.singularLabel,
          pluralLabel: values.pluralLabel,
          description: values.description || null,
        });
        toast.success('Custom object updated');
      } else {
        await createDefinition.mutateAsync({
          key: values.key,
          singularLabel: values.singularLabel,
          pluralLabel: values.pluralLabel,
          description: values.description || null,
        });
        toast.success('Custom object created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} custom object`));
    }
  }

  const isPending = createDefinition.isPending || updateDefinition.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${definition?.singularLabel}` : 'New Custom Object'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Renaming this object updates its labels everywhere it appears — its key and existing fields/records are unaffected.'
              : 'Defines a brand-new tenant entity. Add its fields afterward from the object\'s own page.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Singular Label *</Label>
              <Input {...register('singularLabel')} placeholder="Project" />
              {errors.singularLabel && <p className="text-xs text-destructive">{errors.singularLabel.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Plural Label *</Label>
              <Input {...register('pluralLabel')} placeholder="Projects" />
              {errors.pluralLabel && <p className="text-xs text-destructive">{errors.pluralLabel.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Key *</Label>
            <Input {...register('key')} placeholder="project" disabled={isEdit} />
            {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
            {isEdit && <p className="text-xs text-muted-foreground">The key can&apos;t be changed after creation.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} {...register('description')} placeholder="What is this object used for?" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Object'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
