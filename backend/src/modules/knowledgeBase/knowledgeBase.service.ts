import { Request } from 'express';
import { and, asc, desc, eq, ilike, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { knowledgeArticles } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { orgId } from '@/utils/tenant';

/**
 * `canManage` (derived from the caller's KNOWLEDGE_BASE_MANAGE grant — see this permission's
 * comment in utils/permissions.ts) is a VISIBILITY filter here, not an action gate: create/
 * update/delete are already gated at the router (knowledgeBase.routes.ts's requirePermission), so
 * by the time these three functions run the caller is known to hold it. list/getById are ungated
 * at the router (any authenticated user can call them) and instead narrow their own result set —
 * a caller without the permission never sees a DRAFT article exists at all, rather than seeing it
 * and being blocked from opening it.
 */
export async function listArticles(org: string, query: {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  status?: 'DRAFT' | 'PUBLISHED';
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}, canManage: boolean) {
  const conditions: SQL[] = [eq(knowledgeArticles.organizationId, org)];
  if (!canManage) {
    conditions.push(eq(knowledgeArticles.status, 'PUBLISHED'));
  } else if (query.status) {
    conditions.push(eq(knowledgeArticles.status, query.status));
  }
  if (query.search) {
    conditions.push(or(ilike(knowledgeArticles.title, `%${query.search}%`), ilike(knowledgeArticles.content, `%${query.search}%`))!);
  }
  if (query.category) conditions.push(eq(knowledgeArticles.category, query.category));
  const where = and(...conditions);

  const sortable: Record<string, any> = {
    title: knowledgeArticles.title,
    createdAt: knowledgeArticles.createdAt,
    updatedAt: knowledgeArticles.updatedAt,
  };
  const orderCol = sortable[query.sortBy ?? ''] ?? knowledgeArticles.updatedAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.knowledgeArticles.findMany({
      where,
      orderBy,
      with: { createdBy: { columns: { id: true, firstName: true, lastName: true } } },
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(knowledgeArticles).where(where),
  ]);

  return { data: rows, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getArticleById(org: string, id: string, canManage: boolean) {
  const article = await db.query.knowledgeArticles.findFirst({
    where: and(eq(knowledgeArticles.organizationId, org), eq(knowledgeArticles.id, id)),
    with: { createdBy: { columns: { id: true, firstName: true, lastName: true } } },
  });
  // A DRAFT is reported 404, not 403, for a caller without KNOWLEDGE_BASE_MANAGE — its existence
  // is not disclosed to someone who can't see draft content at all (same "hide, don't just block"
  // reasoning as the module comment above).
  if (!article || (article.status === 'DRAFT' && !canManage)) throw ApiError.notFound('Article not found');
  return article;
}

export async function createArticle(req: Request, input: any) {
  const org = orgId(req);
  const [created] = await db
    .insert(knowledgeArticles)
    .values({
      title: input.title,
      category: input.category ?? null,
      tags: input.tags ?? [],
      content: input.content,
      status: input.status ?? 'DRAFT',
      organizationId: org,
      createdById: req.user!.sub,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
    })
    .returning();
  await recordAudit({ req, action: 'CREATE', entityType: 'KnowledgeArticle', entityId: created.id, newValues: created });
  return getArticleById(org, created.id, true);
}

export async function updateArticle(req: Request, id: string, input: any) {
  const org = orgId(req);
  const before = await db.query.knowledgeArticles.findFirst({ where: and(eq(knowledgeArticles.organizationId, org), eq(knowledgeArticles.id, id)) });
  if (!before) throw ApiError.notFound('Article not found');

  const data: any = { ...input, updatedAt: new Date() };
  const statusChanged = input.status !== undefined && input.status !== before.status;
  if (statusChanged) {
    // Mirrors cases.service.ts's resolvedAt/closedAt derivation: never accepted directly from the
    // request body (the validation schema has no publishedAt field at all), preserved across a
    // PUBLISHED->DRAFT->PUBLISHED round trip rather than reset to "now" each time.
    data.publishedAt = input.status === 'PUBLISHED' ? before.publishedAt ?? new Date() : null;
  }

  const [updated] = await db.update(knowledgeArticles).set(data).where(eq(knowledgeArticles.id, id)).returning();
  await recordAudit({
    req,
    action: statusChanged ? 'STATUS_CHANGED' : 'UPDATE',
    entityType: 'KnowledgeArticle',
    entityId: id,
    oldValues: before,
    newValues: updated,
  });
  return getArticleById(org, id, true);
}

export async function deleteArticle(req: Request, id: string) {
  const org = orgId(req);
  const before = await db.query.knowledgeArticles.findFirst({ where: and(eq(knowledgeArticles.organizationId, org), eq(knowledgeArticles.id, id)) });
  if (!before) throw ApiError.notFound('Article not found');
  await db.delete(knowledgeArticles).where(eq(knowledgeArticles.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'KnowledgeArticle', entityId: id, oldValues: before });
}
