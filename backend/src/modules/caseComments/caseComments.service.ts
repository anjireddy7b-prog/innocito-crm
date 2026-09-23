import { Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { caseComments, cases } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { PERMISSIONS } from '@/utils/permissions';

/**
 * Structurally mirrors modules/comments/comments.service.ts (leads' own comment thread) almost
 * exactly, scoped to cases instead — kept as its own table/module rather than generalizing the
 * leads-only `comments` table (see db/schema.ts's `caseComments` comment for why). Own-comment
 * edit/delete reuses COMMENTS_MANAGE_ANY as-is: that permission's description ("Edit or delete any
 * user's comment, not just your own") was never actually lead-specific, so no new permission is
 * needed for the same override here.
 */
export async function listCaseComments(org: string, caseId: string) {
  return db.query.caseComments.findMany({
    where: and(eq(caseComments.organizationId, org), eq(caseComments.caseId, caseId)),
    orderBy: desc(caseComments.createdAt),
    with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });
}

export async function createCaseComment(req: Request, input: { caseId: string; body: string }) {
  const org = orgId(req);
  const parentCase = await db.query.cases.findFirst({ where: and(eq(cases.organizationId, org), eq(cases.id, input.caseId)) });
  if (!parentCase) throw ApiError.notFound('Case not found');

  const [created] = await db
    .insert(caseComments)
    .values({ organizationId: org, caseId: input.caseId, userId: req.user!.sub, body: input.body })
    .returning();
  const comment = await db.query.caseComments.findFirst({
    where: eq(caseComments.id, created.id),
    with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });

  await recordAudit({ req, action: 'CREATE', entityType: 'CaseComment', entityId: created.id, newValues: created });
  return comment;
}

export async function updateCaseComment(req: Request, id: string, body: string) {
  const org = orgId(req);
  const comment = await db.query.caseComments.findFirst({ where: and(eq(caseComments.organizationId, org), eq(caseComments.id, id)) });
  if (!comment) throw ApiError.notFound('Comment not found');
  if (comment.userId !== req.user!.sub && !req.user!.permissions.includes(PERMISSIONS.COMMENTS_MANAGE_ANY)) {
    throw ApiError.forbidden('You can only edit your own comments');
  }
  const [updated] = await db.update(caseComments).set({ body, editedAt: new Date() }).where(eq(caseComments.id, id)).returning();
  await recordAudit({ req, action: 'UPDATE', entityType: 'CaseComment', entityId: id, oldValues: comment, newValues: updated });
  return updated;
}

export async function deleteCaseComment(req: Request, id: string) {
  const org = orgId(req);
  const comment = await db.query.caseComments.findFirst({ where: and(eq(caseComments.organizationId, org), eq(caseComments.id, id)) });
  if (!comment) throw ApiError.notFound('Comment not found');
  if (comment.userId !== req.user!.sub && !req.user!.permissions.includes(PERMISSIONS.COMMENTS_MANAGE_ANY)) {
    throw ApiError.forbidden('You can only delete your own comments');
  }
  await db.delete(caseComments).where(eq(caseComments.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'CaseComment', entityId: id, oldValues: comment });
}
