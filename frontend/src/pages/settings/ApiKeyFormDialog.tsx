import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermissionsCatalog } from '@/api/roles';
import { useCreateApiKey, type CreatedApiKey } from '@/api/apiKeys';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  permissionKeys: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

/**
 * Phase 11 (API/integrations), slice 1. Reuses the exact same permission-checklist pattern as
 * RoleFormDialog.tsx (grouped by `resource:action` prefix, powered by the same GET /api/permissions
 * catalog) — a key's grants are chosen the same way a role's are. Unlike a role, a key is
 * read-only no matter what's checked here (see backend/src/db/schema.ts's apiKeys table comment):
 * the checklist still shows every permission, including write ones, because a key with, say,
 * `leads:create` checked simply never reaches a POST route as that key — the cutoff is enforced
 * once, in middleware, not by narrowing this list.
 */
export function ApiKeyFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: catalog } = usePermissionsCatalog();
  const createApiKey = useCreateApiKey();
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', permissionKeys: [] },
  });

  useEffect(() => {
    if (open) {
      reset({ name: '', permissionKeys: [] });
      setCreated(null);
      setCopied(false);
    }
  }, [open, reset]);

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
      const result = await createApiKey.mutateAsync(values);
      setCreated(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create API key'));
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      toast.success('Copied to clipboard');
    } catch {
      toast.error("Couldn't copy — select and copy the key manually");
    }
  }

  if (created) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>"{created.name}" created</DialogTitle>
            <DialogDescription>
              Copy this key now — for your security, it's shown only this once and can't be retrieved again. If you lose it, revoke this key and create a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 p-3">
              <code className="flex-1 break-all text-sm">{created.key}</code>
              <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copy API key">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This key can only be used for read (GET) requests. Send it as an <code>X-Api-Key</code> header — never in a URL or query string.</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>New API Key</DialogTitle>
          <DialogDescription>
            Grants read-only (GET) access to whatever's checked below — a key can never create, edit, or delete anything, regardless of which permissions it's granted.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="e.g. Reporting sync" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
            <Button type="submit" loading={createApiKey.isPending}>Create Key</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
