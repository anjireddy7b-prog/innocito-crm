import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  useConnectorProviders,
  useCreateConnectorInstance,
  useUpdateConnectorInstance,
  type ConnectorInstance,
} from '@/api/connectors';
import { apiErrorMessage } from '@/lib/api';

/**
 * Phase 11 (API/integrations), slice 3. Unlike ApiKeyFormDialog/WebhookFormDialog (a fixed set of
 * fields), each provider in the catalog has its OWN config field shape — so this form's fields
 * are genuinely dynamic, driven by GET /connectors/providers, rather than a static
 * react-hook-form + zod schema like the other two dialogs use. Plain useState + manual validation
 * is the simpler, more honest fit here than forcing a per-provider dynamic schema into
 * react-hook-form.
 *
 * Handles both create (no `editing` prop — pick a provider, fill every field) and edit (provider
 * is fixed and shown read-only; secret fields start blank with a "leave blank to keep the current
 * value" hint, matching the backend's own merge behavior in connectors.service.ts).
 */
export function ConnectorFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ConnectorInstance | null;
}) {
  const { data: providers } = useConnectorProviders();
  const createConnector = useCreateConnectorInstance();
  const updateConnector = useUpdateConnectorInstance();

  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProviderId(editing.providerId);
      setName(editing.name);
      // Non-secret fields keep their real current value (config already holds it); secret fields
      // start blank — the UI never has their real value to show, only the masked placeholder.
      setConfig(editing.config);
    } else {
      setProviderId('');
      setName('');
      setConfig({});
    }
    setError(null);
  }, [open, editing]);

  const provider = useMemo(() => providers?.find((p) => p.id === providerId), [providers, providerId]);

  function handleProviderChange(nextProviderId: string) {
    setProviderId(nextProviderId);
    setConfig({});
    if (!name) {
      const next = providers?.find((p) => p.id === nextProviderId);
      if (next) setName(next.name);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!editing && !providerId) return setError('Choose a provider');
    if (!name.trim()) return setError('Name is required');
    if (provider) {
      for (const field of provider.configFields) {
        // On edit, a blank secret field is valid (it means "keep the current value" — see the
        // dialog's own comment above); on create there's no existing value to fall back to, so
        // every required field, secret or not, must be filled in.
        const isBlankSecretOnEdit = !!editing && field.type === 'secret';
        if (field.required && !isBlankSecretOnEdit && !config[field.key]?.trim()) {
          return setError(`${field.label} is required`);
        }
      }
    }

    try {
      if (editing) {
        await updateConnector.mutateAsync({ id: editing.id, name, config });
        toast.success('Connector updated');
      } else {
        await createConnector.mutateAsync({ providerId, name, config });
        toast.success('Connector created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${editing ? 'update' : 'create'} connector`));
    }
  }

  const saving = createConnector.isPending || updateConnector.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit "${editing.name}"` : 'New Connector'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this connector’s name or config. Leave a secret field blank to keep its current value.'
              : 'Store config for a third-party provider. This is groundwork for a future integration — nothing is sent to the provider yet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!editing && (
            <div className="space-y-1.5">
              <Label>Provider *</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {provider && <p className="text-xs text-muted-foreground">{provider.description}</p>}
            </div>
          )}

          {editing && (
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <p className="text-sm text-muted-foreground">{provider?.name ?? editing.providerId} (fixed — delete and recreate to switch providers)</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Alerts" />
          </div>

          {provider?.configFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}{field.required ? ' *' : ''}</Label>
              <Input
                type={field.type === 'secret' ? 'password' : 'text'}
                value={config[field.key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                placeholder={editing && field.type === 'secret' ? 'Leave blank to keep the current value' : field.placeholder}
              />
            </div>
          ))}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" loading={saving} onClick={handleSubmit}>{editing ? 'Save Changes' : 'Create Connector'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
