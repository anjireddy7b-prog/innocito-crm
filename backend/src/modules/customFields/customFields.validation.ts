import { z } from 'zod';

// Phase 4 gave `entityType` on the schema a fixed shape but only ever validated it as the
// literal `'LEAD'`. Phase 5 (custom objects) reuses this exact table/engine for tenant-defined
// object types — see db/schema.ts's customObjectDefinitions comment — so `entityType` now also
// accepts any custom-object key shape (lowercase, checked against that org's actual defined
// objects in the service layer, since a Zod schema alone can't do that DB lookup). `'LEAD'` stays
// uppercase specifically so it can never collide with a lowercase custom-object key.
export const CUSTOM_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const CHOICE_TYPES: CustomFieldType[] = ['SELECT', 'MULTI_SELECT'];

// Machine name stored as the JSON key on leads.customFields (or a custom object record's `data`)
// — kept restrictive (lowercase, digits, underscores) so it's always safe to use as an object key
// and never collides with anything JS/JSON-reserved. Also reused, unchanged, as the shape for a
// custom object's own `key` (see customObjects.validation.ts).
export const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores');

export const entityTypeSchema = z.union([z.literal('LEAD'), keySchema]);

// Phase 6 (dynamic forms/layouts): an optional named group this field renders under (e.g.
// "Contact Preferences") on both the lead form and a custom object's record form — see
// db/schema.ts's `section` column comment and CustomFieldsSection.tsx's grouping logic. Free text,
// not drawn from a fixed catalog: two fields sharing the exact same string render under the same
// group heading, in the order fields are otherwise sorted by (sortOrder, createdAt).
export const sectionSchema = z.string().trim().min(1).max(150).optional().nullable();

function checkOptionsForChoiceTypes(data: { fieldType: CustomFieldType; options?: string[] | null }, ctx: z.RefinementCtx) {
  if (CHOICE_TYPES.includes(data.fieldType) && (!data.options || data.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'At least one option is required for SELECT/MULTI_SELECT fields' });
  }
}

export const listCustomFieldDefinitionsQuerySchema = z.object({
  entityType: entityTypeSchema.default('LEAD'),
});

// key/fieldType/entityType are set once at creation and never editable afterward — renaming a
// key or changing its type would silently orphan or misinterpret values already stored in
// existing leads' `customFields` JSONB bags, which have no migration path of their own.
export const createCustomFieldDefinitionSchema = z
  .object({
    entityType: entityTypeSchema.default('LEAD'),
    key: keySchema,
    label: z.string().trim().min(1).max(200),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(200)).max(50).optional().nullable(),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10000).default(0),
    section: sectionSchema,
  })
  .superRefine(checkOptionsForChoiceTypes);

export const updateCustomFieldDefinitionSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional().nullable(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  section: sectionSchema,
});
