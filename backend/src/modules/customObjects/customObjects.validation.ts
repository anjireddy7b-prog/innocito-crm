import { z } from 'zod';
import { keySchema } from '../customFields/customFields.validation';

// A custom object's own `key` reuses the exact same machine-name shape as a custom *field*'s key
// (see customFields.validation.ts's keySchema) — both end up as plain strings used as either a
// `custom_field_definitions.entityType` value (this object's fields) or a JSON object key, so the
// same "lowercase, digits, underscores, starts with a letter" restriction applies. The regex alone
// already makes 'LEAD' (uppercase) impossible to produce, but this refine keeps the reservation
// explicit and future-proof against the regex ever loosening.
export const createCustomObjectDefinitionSchema = z.object({
  key: keySchema.refine((k) => k !== 'lead', { message: '"lead" is reserved for the built-in Lead entity' }),
  singularLabel: z.string().trim().min(1).max(150),
  pluralLabel: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional().nullable(),
});

// key is set once at creation and never editable afterward — every custom field definition that
// points at this object (via entityType = key) and every existing record's data bag would need a
// migration otherwise. Same key-immutability precedent as leads.customFields' field keys.
export const updateCustomObjectDefinitionSchema = z.object({
  singularLabel: z.string().trim().min(1).max(150).optional(),
  pluralLabel: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

// A record's raw payload is an open bag here — per-field type/required/options validation is
// deferred to validateAndNormalizeCustomFields (customFields.service.ts), which needs a DB lookup
// of this object's field definitions that a Zod schema alone can't perform. Same split as leads:
// leads.validation.ts's `customFields` field is equally permissive at this layer.
export const customObjectRecordDataSchema = z.record(z.string(), z.unknown()).optional();

export const createCustomObjectRecordSchema = z.object({
  data: customObjectRecordDataSchema,
});

export const updateCustomObjectRecordSchema = z.object({
  data: customObjectRecordDataSchema,
});
