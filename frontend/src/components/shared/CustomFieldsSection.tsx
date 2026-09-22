import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomFieldDefinitions, CustomFieldDefinition } from '@/api/customFields';

/**
 * Phase 4: renders an org's admin-defined LEAD custom fields, driven entirely by
 * GET /api/custom-fields — an organization with no fields defined renders nothing, so this is a
 * safe no-op drop-in for every existing lead form. Used by BOTH LeadFormDialog.tsx (create) and
 * LeadEditPanel.tsx (edit) — per those files' own "field order must match field-for-field"
 * convention, this section is added to the same spot in both rather than hooking into either
 * form's own react-hook-form Zod schema (whose fields are fixed at compile time): the value/
 * onChange contract here is a plain `Record<string, unknown>` so it stays decoupled from
 * whatever specific FormValues type each parent form otherwise uses, and each parent wires it in
 * with a single Controller on its own `customFields` field.
 *
 * Phase 5: `entityType` is now a prop (default 'LEAD', unchanged for every existing caller) so the
 * exact same section can render a custom object record's own dynamic fields — see
 * CustomObjectRecordFormDialog.tsx, which passes the object's `key` as entityType.
 */
export function CustomFieldsSection({
  entityType = 'LEAD',
  value,
  onChange,
  hideHeading = false,
}: {
  entityType?: string;
  value: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
  // A custom object record (see CustomObjectRecordFormDialog.tsx) has no other fields alongside
  // these — a "Custom Fields" heading above the record's own entire field set is redundant there,
  // unlike on a lead form where it visually separates these from the built-in typed fields.
  hideHeading?: boolean;
}) {
  const { data: definitions, isLoading } = useCustomFieldDefinitions(entityType);

  if (isLoading || !definitions || definitions.length === 0) return null;

  const bag = value ?? {};

  function setField(key: string, fieldValue: unknown) {
    const next = { ...bag };
    if (fieldValue === undefined || fieldValue === '' || fieldValue === null) {
      delete next[key];
    } else {
      next[key] = fieldValue;
    }
    onChange(next);
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      {!hideHeading && <Label className="text-sm font-semibold text-muted-foreground">Custom Fields</Label>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {definitions.map((def) => (
          <CustomFieldInput key={def.id} definition={def} value={bag[def.key]} onChange={(v) => setField(def.key, v)} />
        ))}
      </div>
    </div>
  );
}

function CustomFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = `${definition.label}${definition.required ? ' *' : ''}`;

  switch (definition.fieldType) {
    case 'TEXT':
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'TEXTAREA':
      return (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{label}</Label>
          <Textarea rows={3} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'NUMBER':
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      );
    case 'DATE':
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-2 pt-6">
          <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
          <Label className="!mt-0">{label}</Label>
        </div>
      );
    case 'SELECT':
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Select value={typeof value === 'string' ? value : '__none__'} onValueChange={(v) => onChange(v === '__none__' ? undefined : v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(definition.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <div className="flex flex-wrap gap-3 rounded-md border border-input px-3 py-2">
            {(definition.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={(checked) => {
                    const next = checked === true ? [...selected, opt] : selected.filter((o) => o !== opt);
                    onChange(next.length ? next : undefined);
                  }}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
