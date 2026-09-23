import { z } from 'zod';

// Phase 8 ("process engines," synchronous validation-rule slice — see db/schema.ts's
// validationRules table comment for why workflow automation/approvals are deferred). LEAD-only
// for now, same precedent as customFieldDefinitions/savedViews.
export const validationRuleEntityTypeSchema = z.literal('LEAD');

export const WHEN_OPERATORS = ['equals', 'not_equals', 'is_set', 'is_not_set'] as const;
export type WhenOperator = (typeof WHEN_OPERATORS)[number];

// Deliberately NOT restricted to a fixed enum of known Lead columns — a rule can reference any
// typed Lead field name or any custom field key (resolved generically at evaluation time, see
// validationRules.service.ts's getFieldValue), so this schema never needs to change when either
// set gains a new field.
const fieldKeySchema = z.string().trim().min(1).max(100);

function requireComparisonValue(data: { whenOperator: WhenOperator; whenValue?: string | null }, ctx: z.RefinementCtx) {
  if ((data.whenOperator === 'equals' || data.whenOperator === 'not_equals') && !data.whenValue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['whenValue'], message: 'A comparison value is required for this operator' });
  }
}

export const listValidationRulesQuerySchema = z.object({
  entityType: validationRuleEntityTypeSchema.default('LEAD'),
});

export const createValidationRuleSchema = z
  .object({
    entityType: validationRuleEntityTypeSchema.default('LEAD'),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(1000).optional().nullable(),
    isActive: z.boolean().default(true),
    whenField: fieldKeySchema,
    whenOperator: z.enum(WHEN_OPERATORS),
    whenValue: z.string().trim().max(255).optional().nullable(),
    // The fields that become required when the condition above matches. Capped at 20 — a rule
    // needing more than that is almost certainly better expressed as several smaller rules.
    thenRequireFields: z.array(fieldKeySchema).min(1).max(20),
    errorMessage: z.string().trim().max(500).optional().nullable(),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  })
  .superRefine(requireComparisonValue);

// A partial update can't fully re-validate the operator/value combination here (whenValue might
// be omitted meaning "leave as-is," not "clear it") — the service layer re-checks the same
// invariant against the fully-merged before/after values before persisting.
export const updateValidationRuleSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  whenField: fieldKeySchema.optional(),
  whenOperator: z.enum(WHEN_OPERATORS).optional(),
  whenValue: z.string().trim().max(255).optional().nullable(),
  thenRequireFields: z.array(fieldKeySchema).min(1).max(20).optional(),
  errorMessage: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
