import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermissionsCatalog, useCreateRole, useUpdateRole, type Role } from '@/api/roles';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  permissionKeys: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(role?: Role | null): FormValues {
  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissionKeys: role?.permissions ?? [],
  };
}

/**
 * Phase 3: roles are admin-editable, tenant-scoped data — this dialog is what actually lets an
 * Admin rename a default role, change its grants, or create a brand-new custom role from
 * scratch. Every permission key comes from GET /api/permissions (the fixed, code-enforced
 * catalog — see backend/src/utils/permissions.ts), grouped here by its `resource:action` prefix
 * purely for readability; the grouping itself carries no meaning to the backend.
 */
export function RoleFormDialog({ role, open, onOpenChange }: { role?: Role | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = !!role;
  const { data: catalog } = usePermissionsCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole(role?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(role),
  });

  useEffect(() => {
    if (open) reset(toDefaults(role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role?.id]);

  const groups = useMemo(() => {
    const byResource = new Map<string, { key: string; description: string | null }[]>();
    for (const p of catalog ?? []) {
      const resource = p.key.split(':')[0];
      if (!byResource.has(resource)) byResource.set(resource, []);
      byResource.get(resource)!.push(p);
    }
    return [...byResource.entries()];
  }, [catalog]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = { name: values.name, description: values.description || null, permissionKeys: values.permissionKeys };
      if (isEdit) {
        await updateRole.mutateAsync(payload);
        toast.success('Role updated');
      } else {
        await createRole.mutateAsync(payload);
        toast.success('Role created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} role`));
    }
  }

  const isPending = createRole.isPending || updateRole.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${role?.name}` : 'New Role'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Renaming or re-granting this role takes effect immediately for everyone currently assigned to it.'
              : 'Create a custom role and choose exactly what it can do.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input {...register('name')} placeholder="Team Lead" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input {...register('description')} placeholder="What this role is for" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <Controller
              control={control}
              name="permissionKeys"
              render={({ field }) => (
                <div className="max-h-96 space-y-4 overflow-y-auto rounded-lg border border-border/60 p-4">
                  {groups.map(([resource, perms]) => (
                    <div key={resource} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{humanizeEnum(resource)}</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {perms.map((p) => {
                          const checked = field.value.includes(p.key);
                          return (
                            <label key={p.key} className="flex items-start gap-2 text-sm">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                onCheckedChange={(v) => {
                                  const next = v ? [...field.value, p.key] : field.value.filter((k) => k !== p.key);
                                  field.onChange(next);
                                }}
                              />
                              <span>{p.description ?? p.key}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!groups.length && <p className="text-sm text-muted-foreground">Loading permissions…</p>}
                </div>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Role'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
