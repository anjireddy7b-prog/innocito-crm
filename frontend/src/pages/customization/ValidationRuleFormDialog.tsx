import { useEffect } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateValidationRule, useUpdateValidationRule, WHEN_OPERATORS, type ValidationRule, type WhenOperator } from '@/api/validationRules';
import { apiErrorMessage } from '@/lib/api';
import { humanizeEnum } from '@/lib/utils';

const OPERATOR_NEEDS_VALUE: WhenOperator[] = ['equals', 'not_equals'];

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150),
    description: z.string().trim().max(2000).optional(),
    isActive: z.boolean(),
    whenField: z.string().trim().min(1, 'Field is required').max(100),
    whenOperator: z.enum(WHEN_OPERATORS),
    whenValue: z.string().trim().max(255).optional(),
    thenRequireFieldsText: z.string().trim().min(1, 'At least one required field is needed'),
    errorMessage: z.string().trim().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (OPERATOR_NEEDS_VALUE.includes(values.whenOperator) && !values.whenValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['whenValue'], message: 'A comparison value is required for this operator' });
    }
  });
type FormValues = z.infer<typeof schema>;

function toDefaults(rule?: ValidationRule | null): FormValues {
  return {
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    isActive: rule?.isActive ?? true,
    whenField: rule?.whenField ?? '',
    whenOperator: rule?.whenOperator ?? 'equals',
    whenValue: rule?.whenValue ?? '',
    thenRequireFieldsText: rule?.thenRequireFields?.join(', ') ?? '',
    errorMessage: rule?.errorMessage ?? '',
  };
}

/**
 * Phase 8: create/edit dialog for a validation rule ("when <field> <operator> [<value>], then
 * <fields> are required"). Field names — both `whenField` and each entry in `thenRequireFields`
 * — can be either a typed Lead column (status, priority, category, dealValue, currency,
 * probability, expectedCloseDate, source, tags, companyId, contactId, campaignId, assignedToId,
 * currentOwnerId, sdrId) or any custom field's key; both are resolved the same way server-side, so
 * this dialog accepts plain text rather than a fixed dropdown (see validationRules.service.ts's
 * getFieldValue).
 */
export function ValidationRuleFormDialog({
  rule,
  open,
  onOpenChange,
}: {
  rule?: ValidationRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!rule;
  const createRule = useCreateValidationRule();
  const updateRule = useUpdateValidationRule(rule?.id ?? '');

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(rule),
  });

  useEffect(() => {
    if (open) reset(toDefaults(rule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id]);

  const whenOperator = useWatch({ control, name: 'whenOperator' });
  const needsValue = OPERATOR_NEEDS_VALUE.includes(whenOperator);

  async function onSubmit(values: FormValues) {
    const thenRequireFields = values.thenRequireFieldsText
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    if (thenRequireFields.length === 0) {
      toast.error('Add at least one required field');
      return;
    }

    const payload = {
      name: values.name,
      description: values.description || null,
      isActive: values.isActive,
      whenField: values.whenField.trim(),
      whenOperator: values.whenOperator,
      whenValue: needsValue ? values.whenValue || null : null,
      thenRequireFields,
      errorMessage: values.errorMessage || null,
    };

    try {
      if (isEdit) {
        await updateRule.mutateAsync(payload);
        toast.success('Validation rule updated');
      } else {
        await createRule.mutateAsync(payload);
        toast.success('Validation rule created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} validation rule`));
    }
  }

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${rule?.name}` : 'New Validation Rule'}</DialogTitle>
          <DialogDescription>
            Blocks saving a lead unless the condition below is either unmet or satisfied — checked on create, edit, and status change.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rule Name *</Label>
            <Input {...register('name')} placeholder="Won deals need a value and close date" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>When Field *</Label>
              <Input {...register('whenField')} placeholder="status" />
              {errors.whenField && <p className="text-xs text-destructive">{errors.whenField.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Operator *</Label>
              <Controller
                control={control}
                name="whenOperator"
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WHEN_OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>{humanizeEnum(op)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Value{needsValue ? ' *' : ''}</Label>
              <Input {...register('whenValue')} placeholder="WON" disabled={!needsValue} />
              {errors.whenValue && <p className="text-xs text-destructive">{errors.whenValue.message}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A field name is either a typed Lead field (e.g. <code>status</code>, <code>priority</code>, <code>dealValue</code>,{' '}
            <code>expectedCloseDate</code>, <code>category</code>) or a custom field&apos;s key.
          </p>

          <div className="space-y-1.5">
            <Label>Then Require Fields (comma-separated) *</Label>
            <Input {...register('thenRequireFieldsText')} placeholder="dealValue, expectedCloseDate" />
            {errors.thenRequireFieldsText && <p className="text-xs text-destructive">{errors.thenRequireFieldsText.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Custom Error Message</Label>
            <Textarea rows={2} {...register('errorMessage')} placeholder="Won leads need a deal value and an expected close date." />
            <p className="text-xs text-muted-foreground">Shown to the user when this rule blocks a save. Leave blank for a generic message.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} {...register('description')} placeholder="What is this rule for?" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="isActive"
              render={({ field: f }) => <Switch checked={f.value} onCheckedChange={f.onChange} />}
            />
            Active
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Rule'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
