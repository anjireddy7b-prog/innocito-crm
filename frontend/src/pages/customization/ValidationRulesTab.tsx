import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useValidationRules, useUpdateValidationRule, useDeleteValidationRule, type ValidationRule } from '@/api/validationRules';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';
import { ValidationRuleFormDialog } from './ValidationRuleFormDialog';

const OPERATOR_NEEDS_VALUE = ['equals', 'not_equals'];

function conditionSummary(rule: ValidationRule): string {
  const op = humanizeEnum(rule.whenOperator).toLowerCase();
  return OPERATOR_NEEDS_VALUE.includes(rule.whenOperator) ? `${rule.whenField} ${op} "${rule.whenValue}"` : `${rule.whenField} ${op}`;
}

// A single row's isActive toggle needs its own hook instance (the mutation is keyed by rule id),
// so it's split out rather than calling useUpdateValidationRule at the tab's top level.
function ActiveToggle({ rule }: { rule: ValidationRule }) {
  const updateRule = useUpdateValidationRule(rule.id);
  return (
    <Switch
      checked={rule.isActive}
      disabled={updateRule.isPending}
      onCheckedChange={async (checked) => {
        try {
          await updateRule.mutateAsync({ isActive: checked });
        } catch (err) {
          toast.error(apiErrorMessage(err, 'Failed to update validation rule'));
        }
      }}
    />
  );
}

/**
 * Phase 8: the validation-rules slice of "workflow automation" (see the Architecture Report's
 * Phase 8 completion section and db/schema.ts's validationRules table comment for the scope
 * decision — synchronous field-requirement rules only, no job queue, no approvals engine).
 * LEAD-only for now, mirroring customFieldDefinitions' own LEAD-only-first precedent.
 */
export function ValidationRulesTab({ canManage }: { canManage: boolean }) {
  const { data: rules, isLoading } = useValidationRules();
  const deleteRule = useDeleteValidationRule();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState<ValidationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ValidationRule | null>(null);

  const columns: DataTableColumn<ValidationRule>[] = [
    {
      key: 'name',
      header: 'Rule',
      cell: (r) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
        </div>
      ),
    },
    { key: 'condition', header: 'When', cell: (r) => <code className="text-xs">{conditionSummary(r)}</code> },
    {
      key: 'require',
      header: 'Then Require',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.thenRequireFields.map((f) => <Badge key={f} variant="outline">{f}</Badge>)}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      cell: (r) => (canManage ? <ActiveToggle rule={r} /> : <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => setEditRule(r)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Require certain fields on a lead whenever a condition is met — e.g. a deal value and close date once a lead is marked Won.
          Checked when a lead is created, edited, or has its status changed.
        </p>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus /> New Rule</Button>}
      </div>

      <DataTable
        columns={columns}
        data={rules ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyTitle="No validation rules yet"
        emptyDescription="Create one to require certain fields before a lead can be saved in a given state."
      />

      {canManage && (
        <>
          <ValidationRuleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
          <ValidationRuleFormDialog rule={editRule} open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)} />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={`Delete "${deleteTarget?.name}"?`}
            description="This rule will no longer be enforced on any lead. This can't be undone."
            destructive
            confirmLabel="Delete Rule"
            loading={deleteRule.isPending}
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteRule.mutateAsync(deleteTarget.id);
                toast.success('Validation rule deleted');
                setDeleteTarget(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, 'Failed to delete validation rule'));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
