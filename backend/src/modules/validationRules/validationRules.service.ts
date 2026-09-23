import { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { validationRules } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { WhenOperator } from './validationRules.validation';

type ValidationRule = typeof validationRules.$inferSelect;

export async function listValidationRules(org: string, entityType: string): Promise<ValidationRule[]> {
  return db.query.validationRules.findMany({
    where: and(eq(validationRules.organizationId, org), eq(validationRules.entityType, entityType)),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
  });
}

export async function getValidationRuleById(org: string, id: string): Promise<ValidationRule> {
  const row = await db.query.validationRules.findFirst({
    where: and(eq(validationRules.organizationId, org), eq(validationRules.id, id)),
  });
  if (!row) throw ApiError.notFound('Validation rule not found');
  return row;
}

function assertComparisonValuePresent(whenOperator: string, whenValue: string | null | undefined) {
  if ((whenOperator === 'equals' || whenOperator === 'not_equals') && !whenValue) {
    throw ApiError.badRequest('A comparison value is required for this operator');
  }
}

export async function createValidationRule(
  req: Request,
  input: {
    entityType: string;
    name: string;
    description?: string | null;
    isActive: boolean;
    whenField: string;
    whenOperator: WhenOperator;
    whenValue?: string | null;
    thenRequireFields: string[];
    errorMessage?: string | null;
    sortOrder: number;
  }
): Promise<ValidationRule> {
  const org = orgId(req);
  assertComparisonValuePresent(input.whenOperator, input.whenValue);

  const existing = await db.query.validationRules.findFirst({
    where: and(
      eq(validationRules.organizationId, org),
      eq(validationRules.entityType, input.entityType),
      eq(validationRules.name, input.name)
    ),
  });
  if (existing) throw ApiError.conflict('A validation rule with this name already exists for this entity type');

  const [created] = await db
    .insert(validationRules)
    .values({
      organizationId: org,
      entityType: input.entityType,
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
      whenField: input.whenField,
      whenOperator: input.whenOperator,
      whenValue: input.whenValue ?? null,
      thenRequireFields: input.thenRequireFields,
      errorMessage: input.errorMessage ?? null,
      sortOrder: input.sortOrder,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'ValidationRule', entityId: created.id, newValues: created });
  return created;
}

export async function updateValidationRule(
  req: Request,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    whenField?: string;
    whenOperator?: WhenOperator;
    whenValue?: string | null;
    thenRequireFields?: string[];
    errorMessage?: string | null;
    sortOrder?: number;
  }
): Promise<ValidationRule> {
  const org = orgId(req);
  const before = await getValidationRuleById(org, id);

  // undefined-means-leave-as-is / explicit-null-means-clear, the same convention used throughout
  // this app's other "definition" tables (see customFields.service.ts's updateCustomFieldDefinition).
  const nextWhenOperator = input.whenOperator ?? (before.whenOperator as WhenOperator);
  const nextWhenValue = input.whenValue === undefined ? before.whenValue : input.whenValue;
  assertComparisonValuePresent(nextWhenOperator, nextWhenValue);

  if (input.name && input.name !== before.name) {
    const duplicate = await db.query.validationRules.findFirst({
      where: and(
        eq(validationRules.organizationId, org),
        eq(validationRules.entityType, before.entityType),
        eq(validationRules.name, input.name)
      ),
    });
    if (duplicate) throw ApiError.conflict('A validation rule with this name already exists for this entity type');
  }

  const [updated] = await db
    .update(validationRules)
    .set({
      name: input.name ?? before.name,
      description: input.description === undefined ? before.description : input.description,
      isActive: input.isActive ?? before.isActive,
      whenField: input.whenField ?? before.whenField,
      whenOperator: nextWhenOperator,
      whenValue: nextWhenValue,
      thenRequireFields: input.thenRequireFields ?? before.thenRequireFields,
      errorMessage: input.errorMessage === undefined ? before.errorMessage : input.errorMessage,
      sortOrder: input.sortOrder ?? before.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(validationRules.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'ValidationRule', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteValidationRule(req: Request, id: string): Promise<void> {
  const org = orgId(req);
  const before = await getValidationRuleById(org, id);
  await db.delete(validationRules).where(eq(validationRules.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'ValidationRule', entityId: id, oldValues: before });
}

// ----------------------------------------------------------------------------
// Enforcement — called from leads.service.ts's createLead/updateLead
// ----------------------------------------------------------------------------

/**
 * A rule's `whenField`/`thenRequireFields` entries can each be either a typed Lead column name
 * or a custom field key — resolved generically here rather than requiring the caller to say
 * which, so a rule never needs to change if a field later moves from one to the other.
 * `effective` is the record's fully-merged post-write field values (see leads.service.ts), with
 * custom fields nested under its own `customFields` key exactly as stored on the row.
 */
function getFieldValue(effective: Record<string, unknown>, key: string): unknown {
  if (key !== 'customFields' && key in effective) return effective[key];
  const customFields = effective.customFields;
  if (customFields && typeof customFields === 'object') return (customFields as Record<string, unknown>)[key];
  return undefined;
}

function isFieldSet(effective: Record<string, unknown>, key: string): boolean {
  const value = getFieldValue(effective, key);
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function conditionMatches(rule: Pick<ValidationRule, 'whenField' | 'whenOperator' | 'whenValue'>, effective: Record<string, unknown>): boolean {
  const set = isFieldSet(effective, rule.whenField);
  switch (rule.whenOperator) {
    case 'is_set':
      return set;
    case 'is_not_set':
      return !set;
    case 'equals':
      return set && String(getFieldValue(effective, rule.whenField)) === rule.whenValue;
    case 'not_equals':
      return !(set && String(getFieldValue(effective, rule.whenField)) === rule.whenValue);
    default:
      return false;
  }
}

/**
 * Evaluates every ACTIVE rule for this org+entityType against `effective` and throws a 400 on
 * the first unmet one — called before the row is written, so a lead can never be saved in a
 * state an active rule forbids. Deliberately NOT wired into the CSV bulk-import path
 * (leads.import.service.ts), which already bypasses Phase 4's custom-field validation the same
 * way for the same reason (a pre-existing scope boundary, not one introduced by this phase) — see
 * the Architecture Report's Phase 8 completion section.
 */
export async function enforceValidationRules(org: string, entityType: string, effective: Record<string, unknown>): Promise<void> {
  const rules = await db.query.validationRules.findMany({
    where: and(eq(validationRules.organizationId, org), eq(validationRules.entityType, entityType), eq(validationRules.isActive, true)),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
  });

  for (const rule of rules) {
    if (!conditionMatches(rule, effective)) continue;
    const requiredFields = Array.isArray(rule.thenRequireFields) ? (rule.thenRequireFields as string[]) : [];
    const missing = requiredFields.filter((key) => !isFieldSet(effective, key));
    if (missing.length) {
      throw ApiError.badRequest(rule.errorMessage || `"${rule.name}": ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    }
  }
}
