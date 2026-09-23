import { Request } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/config/db';
import { dashboardWidgets } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { getReportDefinitionById } from '@/modules/reportBuilder/reportBuilder.service';

// Phase 10 (reporting/dashboard builder), slice 2 — every function here is scoped to
// req.user!.sub, never a param, the same discipline savedViews/reportBuilder use for a caller's
// own personal rows (see dashboardWidgets.validation.ts's own comment).

export async function listMyWidgets(req: Request) {
  const userId = req.user!.sub;
  return db.query.dashboardWidgets.findMany({
    where: eq(dashboardWidgets.userId, userId),
    with: {
      reportDefinition: {
        columns: { id: true, name: true, description: true, groupBy: true, metric: true, chartType: true, isShared: true },
      },
    },
    orderBy: asc(dashboardWidgets.sortOrder),
  });
}

export async function pinReport(req: Request, reportDefinitionId: string) {
  const org = orgId(req);
  const userId = req.user!.sub;

  // Reuses reportBuilder.service.ts's own ownership/shared visibility check — a caller can only
  // ever pin a report they could otherwise see (their own, or a shared one); this throws 404
  // exactly as running or editing that report would for the same caller.
  await getReportDefinitionById(req, reportDefinitionId);

  const existing = await db.query.dashboardWidgets.findFirst({
    where: and(eq(dashboardWidgets.userId, userId), eq(dashboardWidgets.reportDefinitionId, reportDefinitionId)),
  });
  // Pinning an already-pinned report is a no-op from the caller's point of view, not a second
  // widget or an error — see the unique index's own comment in db/schema.ts.
  if (existing) return existing;

  const [{ value: maxSortOrder }] = await db
    .select({ value: sql<number>`coalesce(max(${dashboardWidgets.sortOrder}), -1)` })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.userId, userId));

  const [created] = await db
    .insert(dashboardWidgets)
    .values({ organizationId: org, userId, reportDefinitionId, sortOrder: Number(maxSortOrder) + 1 })
    .returning();
  return created;
}

export async function unpinWidget(req: Request, widgetId: string) {
  const userId = req.user!.sub;
  const existing = await db.query.dashboardWidgets.findFirst({
    where: and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.userId, userId)),
  });
  if (!existing) throw ApiError.notFound('Widget not found');
  await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, widgetId));
}

export async function reorderWidgets(req: Request, orderedIds: string[]) {
  const userId = req.user!.sub;
  const current = await db.query.dashboardWidgets.findMany({ where: eq(dashboardWidgets.userId, userId) });

  const currentIds = new Set(current.map((w) => w.id));
  const requestedIds = new Set(orderedIds);
  if (currentIds.size !== requestedIds.size || [...currentIds].some((id) => !requestedIds.has(id))) {
    throw ApiError.badRequest('orderedIds must contain exactly your current widgets, no more and no fewer');
  }

  await Promise.all(orderedIds.map((id, index) => db.update(dashboardWidgets).set({ sortOrder: index, updatedAt: new Date() }).where(eq(dashboardWidgets.id, id))));
  return listMyWidgets(req);
}
