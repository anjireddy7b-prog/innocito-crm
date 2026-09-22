import { Request } from 'express';
import { and, eq, asc, count } from 'drizzle-orm';
import { db } from '@/config/db';
import { customObjectDefinitions, customObjectRecords, customFieldDefinitions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { paginationMeta, toLimitOffset, type PaginationQuery } from '@/utils/pagination';
import { validateAndNormalizeCustomFields } from '../customFields/customFields.service';

type CustomObjectDefinition = typeof customObjectDefinitions.$inferSelect;
type CustomObjectRecord = typeof customObjectRecords.$inferSelect;

export async function listCustomObjectDefinitions(org: string): Promise<CustomObjectDefinition[]> {
  return db.query.customObjectDefinitions.findMany({
    where: eq(customObjectDefinitions.organizationId, org),
    orderBy: [asc(customObjectDefinitions.createdAt)],
  });
}

export async function getCustomObjectDefinitionById(org: string, id: string): Promise<CustomObjectDefinition> {
  const row = await db.query.customObjectDefinitions.findFirst({
    where: and(eq(customObjectDefinitions.organizationId, org), eq(customObjectDefinitions.id, id)),
  });
  if (!row) throw ApiError.notFound('Custom object not found');
  return row;
}

export async function createCustomObjectDefinition(
  req: Request,
  input: { key: string; singularLabel: string; pluralLabel: string; description?: string | null }
): Promise<CustomObjectDefinition> {
  const org = orgId(req);
  const existing = await db.query.customObjectDefinitions.findFirst({
    where: and(eq(customObjectDefinitions.organizationId, org), eq(customObjectDefinitions.key, input.key)),
  });
  if (existing) throw ApiError.conflict('A custom object with this key already exists');

  const [created] = await db
    .insert(customObjectDefinitions)
    .values({
      organizationId: org,
      key: input.key,
      singularLabel: input.singularLabel,
      pluralLabel: input.pluralLabel,
      description: input.description ?? null,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'CustomObjectDefinition', entityId: created.id, newValues: created });
  return created;
}

export async function updateCustomObjectDefinition(
  req: Request,
  id: string,
  input: { singularLabel?: string; pluralLabel?: string; description?: string | null }
): Promise<CustomObjectDefinition> {
  const org = orgId(req);
  const before = await getCustomObjectDefinitionById(org, id);

  const [updated] = await db
    .update(customObjectDefinitions)
    .set({
      singularLabel: input.singularLabel ?? before.singularLabel,
      pluralLabel: input.pluralLabel ?? before.pluralLabel,
      description: input.description === undefined ? before.description : input.description,
      updatedAt: new Date(),
    })
    .where(eq(customObjectDefinitions.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'CustomObjectDefinition', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteCustomObjectDefinition(req: Request, id: string): Promise<void> {
  const org = orgId(req);
  const before = await getCustomObjectDefinitionById(org, id);

  // customObjectRecords.objectDefinitionId has a DB-level ON DELETE CASCADE FK, so deleting the
  // definition row auto-deletes every record. custom_field_definitions has NO such FK — entityType
  // there is just a string match against this object's key, not a foreign key — so its rows must
  // be cleaned up explicitly here, or they'd become orphaned definitions that can never be reached
  // (nothing can list entityType = a key no custom object owns anymore) but would still occupy the
  // (organizationId, entityType, key) uniqueness space if the same key were ever reused.
  await db.delete(customFieldDefinitions).where(and(eq(customFieldDefinitions.organizationId, org), eq(customFieldDefinitions.entityType, before.key)));

  await db.delete(customObjectDefinitions).where(eq(customObjectDefinitions.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'CustomObjectDefinition', entityId: id, oldValues: before });
}

export async function listCustomObjectRecords(
  org: string,
  definitionId: string,
  query: PaginationQuery
): Promise<{ data: CustomObjectRecord[]; meta: ReturnType<typeof paginationMeta> }> {
  // Confirms the definition exists (and belongs to this org) before listing its records — a
  // stale/foreign definitionId should 404, not return an empty list.
  await getCustomObjectDefinitionById(org, definitionId);

  const where = and(eq(customObjectRecords.organizationId, org), eq(customObjectRecords.objectDefinitionId, definitionId));

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.customObjectRecords.findMany({
      where,
      orderBy: [asc(customObjectRecords.createdAt)],
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(customObjectRecords).where(where),
  ]);

  return { data: rows, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getCustomObjectRecordById(org: string, definitionId: string, recordId: string): Promise<CustomObjectRecord> {
  const row = await db.query.customObjectRecords.findFirst({
    where: and(
      eq(customObjectRecords.organizationId, org),
      eq(customObjectRecords.objectDefinitionId, definitionId),
      eq(customObjectRecords.id, recordId)
    ),
  });
  if (!row) throw ApiError.notFound('Custom object record not found');
  return row;
}

export async function createCustomObjectRecord(
  req: Request,
  definitionId: string,
  input: { data?: Record<string, unknown> }
): Promise<CustomObjectRecord> {
  const org = orgId(req);
  const definition = await getCustomObjectDefinitionById(org, definitionId);

  // Unlike a lead (typed columns + a supplementary `customFields` bag), a custom object record has
  // no typed columns at all — `data` IS the entire record, validated wholesale against this
  // object's own field definitions via the exact same engine Phase 4 built for leads.
  const data = await validateAndNormalizeCustomFields(org, definition.key, input.data);

  const [created] = await db
    .insert(customObjectRecords)
    .values({ organizationId: org, objectDefinitionId: definition.id, data, createdById: req.user?.sub })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'CustomObjectRecord', entityId: created.id, newValues: created });
  return created;
}

export async function updateCustomObjectRecord(
  req: Request,
  definitionId: string,
  recordId: string,
  input: { data?: Record<string, unknown> }
): Promise<CustomObjectRecord> {
  const org = orgId(req);
  const definition = await getCustomObjectDefinitionById(org, definitionId);
  const before = await getCustomObjectRecordById(org, definitionId, recordId);

  // Full-replace semantics, matching leads.customFields / tags precedent: the payload passed here
  // becomes the entire stored `data` bag, not a merge into the existing one.
  const data = await validateAndNormalizeCustomFields(org, definition.key, input.data);

  const [updated] = await db
    .update(customObjectRecords)
    .set({ data, updatedAt: new Date() })
    .where(eq(customObjectRecords.id, recordId))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'CustomObjectRecord', entityId: recordId, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteCustomObjectRecord(req: Request, definitionId: string, recordId: string): Promise<void> {
  const org = orgId(req);
  const before = await getCustomObjectRecordById(org, definitionId, recordId);
  await db.delete(customObjectRecords).where(eq(customObjectRecords.id, recordId));
  await recordAudit({ req, action: 'DELETE', entityType: 'CustomObjectRecord', entityId: recordId, oldValues: before });
}
