import { Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { comments, leads } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordActivity } from '@/utils/activityLogger';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';

export async function listComments(org: string, leadId: string) {
  return db.query.comments.findMany({
    where: and(eq(comments.organizationId, org), eq(comments.leadId, leadId)),
    orderBy: desc(comments.createdAt),
    with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });
}

export async function createComment(req: Request, input: { leadId: string; body: string }) {
  const org = orgId(req);
  const lead = await db.query.leads.findFirst({ where: and(eq(leads.organizationId, org), eq(leads.id, input.leadId)) });
  if (!lead) throw ApiError.notFound('Lead not found');

  const [created] = await db
    .insert(comments)
    .values({ organizationId: org, leadId: input.leadId, userId: req.user!.sub, body: input.body })
    .returning();
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, created.id),
    with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });

  await recordActivity({
    organizationId: org,
    type: 'COMMENT_ADDED',
    description: 'Comment added',
    leadId: input.leadId,
    userId: req.user!.sub,
    metadata: { commentId: created.id },
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'Comment', entityId: created.id, newValues: created });

  return comment;
}

export async function updateComment(req: Request, id: string, body: string) {
  const org = orgId(req);
  const comment = await db.query.comments.findFirst({ where: and(eq(comments.organizationId, org), eq(comments.id, id)) });
  if (!comment) throw ApiError.notFound('Comment not found');
  if (comment.userId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You can only edit your own comments');
  }
  const [updated] = await db.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, id)).returning();
  await recordAudit({ req, action: 'UPDATE', entityType: 'Comment', entityId: id, oldValues: comment, newValues: updated });
  return updated;
}

export async function deleteComment(req: Request, id: string) {
  const org = orgId(req);
  const comment = await db.query.comments.findFirst({ where: and(eq(comments.organizationId, org), eq(comments.id, id)) });
  if (!comment) throw ApiError.notFound('Comment not found');
  if (comment.userId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You can only delete your own comments');
  }
  await db.delete(comments).where(eq(comments.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Comment', entityId: id, oldValues: comment });
}
