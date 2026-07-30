import { Request } from 'express';
import { and, asc, desc, eq, ilike, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { contacts, leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';

export async function listContacts(query: {
  page: number;
  pageSize: number;
  search?: string;
  companyId?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [];
  if (query.search) {
    conditions.push(
      or(
        ilike(contacts.firstName, `%${query.search}%`),
        ilike(contacts.lastName, `%${query.search}%`),
        ilike(contacts.email, `%${query.search}%`)
      )!
    );
  }
  if (query.companyId) conditions.push(eq(contacts.companyId, query.companyId));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortable: Record<string, any> = { firstName: contacts.firstName, lastName: contacts.lastName, createdAt: contacts.createdAt };
  const orderCol = sortable[query.sortBy ?? ''] ?? contacts.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.contacts.findMany({
      where,
      orderBy,
      with: { company: { columns: { id: true, name: true, domain: true } } },
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(contacts).where(where),
  ]);

  return { data: rows, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getContactById(id: string) {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    with: { company: true, leads: { orderBy: desc(leads.createdAt) } },
  });
  if (!contact) throw ApiError.notFound('Contact not found');
  return contact;
}

export async function createContact(req: Request, input: any) {
  const [contact] = await db
    .insert(contacts)
    .values({ ...input, email: input.email || null, createdById: req.user!.sub })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'Contact', entityId: contact.id, newValues: contact });
  return contact;
}

export async function updateContact(req: Request, id: string, input: any) {
  const before = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!before) throw ApiError.notFound('Contact not found');
  const [contact] = await db
    .update(contacts)
    .set({ ...input, email: input.email === '' ? null : input.email, updatedAt: new Date() })
    .where(eq(contacts.id, id))
    .returning();
  await recordAudit({ req, action: 'UPDATE', entityType: 'Contact', entityId: id, oldValues: before, newValues: contact });
  return contact;
}

export async function deleteContact(req: Request, id: string) {
  const before = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!before) throw ApiError.notFound('Contact not found');
  await db.delete(contacts).where(eq(contacts.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Contact', entityId: id, oldValues: before });
}
