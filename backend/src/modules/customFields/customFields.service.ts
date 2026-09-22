import { Request } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { customFieldDefinitions, customObjectDefinitions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { CustomFieldType } from './customFields.validation';

type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;

export async function listCustomFieldDefinitions(org: string, entityType: string): Promise<CustomFieldDefinition[]> {
  return db.query.customFieldDefinitions.findMany({
    where: and(eq(customFieldDefinitions.organizationId, org), eq(customFieldDefinitions.entityType, entityType)),
    orderBy: [asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.createdAt)],
  });
}

export async function getCustomFieldDefinitionById(org: string, id: string): Promise<CustomFieldDefinition> {
  const row = await db.query.customFieldDefinitions.findFirst({
    where: and(eq(customFieldDefinitions.organizationId, org), eq(customFieldDefinitions.id, id)),
  });
  if (!row) throw ApiError.notFound('Custom field not found');
  return row;
}

export async function createCustomFieldDefinition(
  req: Request,
  input: { entityType: string; key: string; label: string; fieldType: CustomFieldType; options?: string[] | null; required: boolean; sortOrder: number }
): Promise<CustomFieldDefinition> {
  const org = orgId(req);

  // Phase 5: 'LEAD' is always valid (built in), but any other entityType must be a custom
  // object this org has actually defined — otherwise a caller could attach fields to a
  // custom-object key that doesn't exist (typo, deleted object, wrong org).
  if (input.entityType !== 'LEAD') {
    const objectDefinition = await db.query.customObjectDefinitions.findFirst({
      where: and(eq(customObjectDefinitions.organizationId, org), eq(customObjectDefinitions.key, input.entityType)),
    });
    if (!objectDefinition) throw ApiError.notFound(`Custom object "${input.entityType}" not found for this organization`);
  }

  const existing = await db.query.customFieldDefinitions.findFirst({
    where: and(
      eq(customFieldDefinitions.organizationId, org),
      eq(customFieldDefinitions.entityType, input.entityType),
      eq(customFieldDefinitions.key, input.key)
    ),
  });
  if (existing) throw ApiError.conflict('A custom field with this key already exists for this entity type');

  const [created] = await db
    .insert(customFieldDefinitions)
    .values({
      organizationId: org,
      entityType: input.entityType,
      key: input.key,
      label: input.label,
      fieldType: input.fieldType,
      options: input.options ?? null,
      required: input.required,
      sortOrder: input.sortOrder,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'CustomFieldDefinition', entityId: created.id, newValues: created });
  return created;
}

export async function updateCustomFieldDefinition(
  req: Request,
  id: string,
  input: { label?: string; options?: string[] | null; required?: boolean; sortOrder?: number }
): Promise<CustomFieldDefinition> {
  const org = orgId(req);
  const before = await getCustomFieldDefinitionById(org, id);

  const nextOptions = input.options === undefined ? before.options : input.options;
  const isChoiceType = before.fieldType === 'SELECT' || before.fieldType === 'MULTI_SELECT';
  if (isChoiceType && (!nextOptions || (nextOptions as unknown[]).length === 0)) {
    throw ApiError.badRequest('At least one option is required for SELECT/MULTI_SELECT fields');
  }

  const [updated] = await db
    .update(customFieldDefinitions)
    .set({
      label: input.label ?? before.label,
      options: nextOptions,
      required: input.required ?? before.required,
      sortOrder: input.sortOrder ?? before.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(customFieldDefinitions.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'CustomFieldDefinition', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteCustomFieldDefinition(req: Request, id: string): Promise<void> {
  const org = orgId(req);
  const before = await getCustomFieldDefinitionById(org, id);
  await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'CustomFieldDefinition', entityId: id, oldValues: before });
  // Deliberately does NOT scrub this field's key out of every existing lead's `customFields`
  // JSONB bag — those become harmless orphaned values (never rendered, since rendering is
  // driven by the current field-definition list), consistent with this app's general pattern of
  // not doing a data-wide cleanup pass on every delete (e.g. deleting a role only blocks while a
  // user still holds it — see roles.service.ts — it doesn't rewrite historical audit log rows
  // that reference it either).
}

/**
 * Validates and normalizes a lead's `customFields` payload against this organization's LEAD
 * field definitions. Used by leads.service.ts's createLead/updateLead so a lead's custom-field
 * bag can never contain a key the org hasn't defined, a value of the wrong shape for its type, or
 * be missing a required field's value.
 *
 * Returns the sanitized object to store — unknown keys are rejected outright (400) rather than
 * silently dropped, since a caller sending them is almost certainly a bug (a stale field key, a
 * typo) that's better surfaced than swallowed. Full-replace semantics: this is the entire bag
 * that gets stored, matching how `tags` already works on this same table (see leads.service.ts).
 */
export async function validateAndNormalizeCustomFields(
  org: string,
  entityType: string,
  payload: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  const definitions = await listCustomFieldDefinitions(org, entityType);
  const bag = payload ?? {};

  const definitionByKey = new Map(definitions.map((d) => [d.key, d]));
  const unknownKeys = Object.keys(bag).filter((k) => !definitionByKey.has(k));
  if (unknownKeys.length) {
    throw ApiError.badRequest(`Unknown custom field key(s): ${unknownKeys.join(', ')}`);
  }

  const normalized: Record<string, unknown> = {};
  for (const def of definitions) {
    const raw = bag[def.key];
    const isEmpty = raw === undefined || raw === null || raw === '';

    if (isEmpty) {
      if (def.required) throw ApiError.badRequest(`Custom field "${def.label}" is required`);
      continue; // omit from the stored bag rather than storing null/empty
    }

    normalized[def.key] = coerceCustomFieldValue(def, raw);
  }

  return normalized;
}

function coerceCustomFieldValue(def: CustomFieldDefinition, raw: unknown): unknown {
  const options = Array.isArray(def.options) ? (def.options as string[]) : [];

  switch (def.fieldType) {
    case 'TEXT':
    case 'TEXTAREA': {
      if (typeof raw !== 'string') throw ApiError.badRequest(`Custom field "${def.label}" must be text`);
      return raw;
    }
    case 'NUMBER': {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) {
        throw ApiError.badRequest(`Custom field "${def.label}" must be a number`);
      }
      if (Number.isNaN(num)) throw ApiError.badRequest(`Custom field "${def.label}" must be a number`);
      return num;
    }
    case 'DATE': {
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
        throw ApiError.badRequest(`Custom field "${def.label}" must be a valid date`);
      }
      return raw;
    }
    case 'BOOLEAN': {
      if (typeof raw !== 'boolean') throw ApiError.badRequest(`Custom field "${def.label}" must be true or false`);
      return raw;
    }
    case 'SELECT': {
      if (typeof raw !== 'string' || !options.includes(raw)) {
        throw ApiError.badRequest(`Custom field "${def.label}" must be one of: ${options.join(', ')}`);
      }
      return raw;
    }
    case 'MULTI_SELECT': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !options.includes(v))) {
        throw ApiError.badRequest(`Custom field "${def.label}" must be a list of: ${options.join(', ')}`);
      }
      return raw;
    }
    default:
      return raw;
  }
}
