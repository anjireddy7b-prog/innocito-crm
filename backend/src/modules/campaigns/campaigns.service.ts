import { Request } from 'express';
import { and, asc, desc, eq, ilike, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { campaigns, leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';

export async function listCampaigns(query: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [];
  if (query.search) conditions.push(ilike(campaigns.name, `%${query.search}%`));
  if (query.status) conditions.push(eq(campaigns.status, query.status));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortable: Record<string, any> = { name: campaigns.name, createdAt: campaigns.createdAt, startDate: campaigns.startDate, status: campaigns.status };
  const orderCol = sortable[query.sortBy ?? ''] ?? campaigns.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.campaigns.findMany({ where, orderBy, ...toLimitOffset(query.page, query.pageSize) }),
    db.select({ value: count() }).from(campaigns).where(where),
  ]);

  const withCounts = await Promise.all(
    rows.map(async (c) => {
      const [{ value: leadCount }] = await db.select({ value: count() }).from(leads).where(eq(leads.campaignId, c.id));
      return { ...c, _count: { leads: Number(leadCount) } };
    })
  );

  return { data: withCounts, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getCampaignById(id: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, id),
    with: { leads: { with: { company: true, contact: true }, orderBy: desc(leads.createdAt) } },
  });
  if (!campaign) throw ApiError.notFound('Campaign not found');
  return campaign;
}

export async function createCampaign(req: Request, input: any) {
  const [campaign] = await db
    .insert(campaigns)
    .values({ ...input, budget: input.budget?.toString(), createdById: req.user!.sub })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'Campaign', entityId: campaign.id, newValues: campaign });
  return campaign;
}

export async function updateCampaign(req: Request, id: string, input: any) {
  const before = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  if (!before) throw ApiError.notFound('Campaign not found');
  const [campaign] = await db
    .update(campaigns)
    .set({ ...input, budget: input.budget?.toString(), updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .returning();
  await recordAudit({ req, action: 'UPDATE', entityType: 'Campaign', entityId: id, oldValues: before, newValues: campaign });
  return campaign;
}

export async function deleteCampaign(req: Request, id: string) {
  const before = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  if (!before) throw ApiError.notFound('Campaign not found');
  await db.delete(campaigns).where(eq(campaigns.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Campaign', entityId: id, oldValues: before });
}
