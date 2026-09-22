import { Request } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { pipelineStages } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';

type PipelineStage = typeof pipelineStages.$inferSelect;

export async function listPipelineStages(org: string): Promise<PipelineStage[]> {
  return db.query.pipelineStages.findMany({
    where: eq(pipelineStages.organizationId, org),
    orderBy: asc(pipelineStages.sortOrder),
  });
}

async function getPipelineStageById(org: string, id: string): Promise<PipelineStage> {
  const row = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.organizationId, org), eq(pipelineStages.id, id)),
  });
  if (!row) throw ApiError.notFound('Pipeline stage not found');
  return row;
}

export async function updatePipelineStage(
  req: Request,
  id: string,
  input: { label?: string; sortOrder?: number; isWon?: boolean; isLost?: boolean; isTerminal?: boolean }
): Promise<PipelineStage> {
  const org = orgId(req);
  const before = await getPipelineStageById(org, id);

  const isWon = input.isWon ?? before.isWon;
  const isLost = input.isLost ?? before.isLost;
  if (isWon && isLost) {
    throw ApiError.badRequest('A stage cannot be both won and lost');
  }
  // isWon/isLost only make sense on a terminal stage — a lead can't be simultaneously "won" and
  // still open. Force isTerminal on rather than rejecting, since flipping isWon on is the whole
  // point of the call and the terminal-ness follows from it by definition.
  const resolvedTerminal = isWon || isLost ? true : input.isTerminal ?? before.isTerminal;

  const [updated] = await db
    .update(pipelineStages)
    .set({
      label: input.label ?? before.label,
      sortOrder: input.sortOrder ?? before.sortOrder,
      isWon,
      isLost,
      isTerminal: resolvedTerminal,
      updatedAt: new Date(),
    })
    .where(eq(pipelineStages.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'PipelineStage', entityId: id, oldValues: before, newValues: updated });
  return updated;
}
