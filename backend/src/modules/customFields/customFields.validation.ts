import { z } from 'zod';

// MVP scope (Phase 4): `entityType` on the schema is generic (see db/schema.ts's
// customFieldDefinitions table comment) so a future phase can extend beyond leads without a
// migration, but validation/UI only ever accepts 'LEAD' today.
export const CUSTOM_FIELD_ENTITY_TYPES = ['LEAD'] as const;
export const CUSTOM_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const CHOICE_TYPES: CustomFieldType[] = ['SELECT', 'MULTI_SELECT'];

// Machine name stored as the JSON key on leads.customFields — kept restrictive (lowercase,
// digits, underscores) so it's always safe to use as an object key and never collides with
// anything JS/JSON-reserved.
const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores');

function checkOptionsForChoiceTypes(data: { fieldType: CustomFieldType; options?: string[] | null }, ctx: z.RefinementCtx) {
  if (CHOICE_TYPES.includes(data.fieldType) && (!data.options || data.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'At least one option is required for SELECT/MULTI_SELECT fields' });
  }
}

export const listCustomFieldDefinitionsQuerySchema = z.object({
  entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES).default('LEAD'),
});

// key/fieldType/entityType are set once at creation and never editable afterward — renaming a
// key or changing its type would silently orphan or misinterpret values already stored in
// existing leads' `customFields` JSONB bags, which have no migration path of their own.
export const createCustomFieldDefinitionSchema = z
  .object({
    entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES).default('LEAD'),
    key: keySchema,
    label: z.string().trim().min(1).max(200),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(200)).max(50).optional().nullable(),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  })
  .superRefine(checkOptionsForChoiceTypes);

export const updateCustomFieldDefinitionSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional().nullable(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
