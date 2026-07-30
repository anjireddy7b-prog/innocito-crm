import { Request } from 'express';
import { and, asc, desc, eq, ilike, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { companies, contacts, leads, documents } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { cache } from '@/config/redis';

export async function listCompanies(query: {
  page: number;
  pageSize: number;
  search?: string;
  country?: string;
  industry?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [];
  if (query.search) {
    conditions.push(or(ilike(companies.name, `%${query.search}%`), ilike(companies.domain, `%${query.search}%`))!);
  }
  if (query.country) conditions.push(eq(companies.country, query.country));
  if (query.industry) conditions.push(eq(companies.industry, query.industry));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortable: Record<string, any> = { name: companies.name, createdAt: companies.createdAt, country: companies.country, industry: companies.industry };
  const orderCol = sortable[query.sortBy ?? ''] ?? companies.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.companies.findMany({ where, orderBy, ...toLimitOffset(query.page, query.pageSize) }),
    db.select({ value: count() }).from(companies).where(where),
  ]);

  const withCounts = await Promise.all(
    rows.map(async (c) => {
      const [[{ value: leadCount }], [{ value: contactCount }]] = await Promise.all([
        db.select({ value: count() }).from(leads).where(eq(leads.companyId, c.id)),
        db.select({ value: count() }).from(contacts).where(eq(contacts.companyId, c.id)),
      ]);
      return { ...c, _count: { leads: Number(leadCount), contacts: Number(contactCount) } };
    })
  );

  return { data: withCounts, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getCompanyById(id: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    with: {
      contacts: { orderBy: desc(contacts.createdAt) },
      leads: {
        orderBy: desc(leads.createdAt),
        limit: 20,
        with: { contact: true, assignedTo: true },
      },
    },
  });
  if (!company) throw ApiError.notFound('Company not found');

  const [[{ value: leadCount }], [{ value: contactCount }], [{ value: docCount }]] = await Promise.all([
    db.select({ value: count() }).from(leads).where(eq(leads.companyId, id)),
    db.select({ value: count() }).from(contacts).where(eq(contacts.companyId, id)),
    db.select({ value: count() }).from(documents).where(eq(documents.companyId, id)),
  ]);

  return { ...company, _count: { leads: Number(leadCount), contacts: Number(contactCount), documents: Number(docCount) } };
}

export async function createCompany(req: Request, input: any) {
  const [company] = await db
    .insert(companies)
    .values({ ...input, annualRevenue: input.annualRevenue?.toString(), createdById: req.user!.sub })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'Company', entityId: company.id, newValues: company });
  await cache.del('dashboard:*');
  return company;
}

export async function updateCompany(req: Request, id: string, input: any) {
  const before = await db.query.companies.findFirst({ where: eq(companies.id, id) });
  if (!before) throw ApiError.notFound('Company not found');
  const [company] = await db
    .update(companies)
    .set({ ...input, annualRevenue: input.annualRevenue?.toString(), updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  await recordAudit({ req, action: 'UPDATE', entityType: 'Company', entityId: id, oldValues: before, newValues: company });
  return company;
}

export async function deleteCompany(req: Request, id: string) {
  const before = await db.query.companies.findFirst({ where: eq(companies.id, id) });
  if (!before) throw ApiError.notFound('Company not found');
  await db.delete(companies).where(eq(companies.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Company', entityId: id, oldValues: before });
}
