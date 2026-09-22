import { Request } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/config/db';
import { savedViews } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { PERMISSIONS } from '@/utils/permissions';

type SavedView = typeof savedViews.$inferSelect;

function canManageShared(req: Request): boolean {
  return req.user!.permissions.includes(PERMISSIONS.SAVED_VIEWS_MANAGE_SHARED);
}

// A caller sees their own personal views plus every shared view for this org+entityType — never
// another user's personal ones. `req.user!.sub` (not a param) so a caller can never list another
// user's personal views by passing someone else's id.
export async function listSavedViews(req: Request, entityType: string): Promise<SavedView[]> {
  const org = orgId(req);
  const userId = req.user!.sub;
  return db.query.savedViews.findMany({
    where: and(
      eq(savedViews.organizationId, org),
      eq(savedViews.entityType, entityType),
      or(eq(savedViews.isShared, true), eq(savedViews.createdById, userId))
    ),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

async function getOwnedOrSharedSavedView(req: Request, id: string): Promise<SavedView> {
  const org = orgId(req);
  const row = await db.query.savedViews.findFirst({ where: and(eq(savedViews.organizationId, org), eq(savedViews.id, id)) });
  if (!row) throw ApiError.notFound('Saved view not found');

  // Visibility mirrors listSavedViews: a caller may look up a view by id only if it's their own
  // or shared — otherwise this would leak another user's personal view's existence/filters.
  const userId = req.user!.sub;
  if (!row.isShared && row.createdById !== userId) throw ApiError.notFound('Saved view not found');
  return row;
}

export async function getSavedViewById(req: Request, id: string): Promise<SavedView> {
  return getOwnedOrSharedSavedView(req, id);
}

export async function createSavedView(
  req: Request,
  input: { entityType: string; name: string; filters: Record<string, string>; isShared: boolean }
): Promise<SavedView> {
  const org = orgId(req);
  const userId = req.user!.sub;

  if (input.isShared && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared views can create a shared view');
  }

  const existing = await db.query.savedViews.findFirst({
    where: and(
      eq(savedViews.organizationId, org),
      eq(savedViews.entityType, input.entityType),
      eq(savedViews.createdById, userId),
      eq(savedViews.name, input.name)
    ),
  });
  if (existing) throw ApiError.conflict('You already have a saved view with this name');

  const [created] = await db
    .insert(savedViews)
    .values({
      organizationId: org,
      entityType: input.entityType,
      name: input.name,
      filters: input.filters,
      isShared: input.isShared,
      createdById: userId,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'SavedView', entityId: created.id, newValues: created });
  return created;
}

export async function updateSavedView(
  req: Request,
  id: string,
  input: { name?: string; filters?: Record<string, string>; isShared?: boolean }
): Promise<SavedView> {
  const before = await getOwnedOrSharedSavedView(req, id);
  const userId = req.user!.sub;

  // Editing an existing SHARED view, or turning a personal one INTO a shared one, always needs
  // SAVED_VIEWS_MANAGE_SHARED — collectively maintained, not just by whoever happened to create
  // it. Editing your own personal view needs nothing beyond owning it; you may never edit someone
  // else's personal view regardless of permissions (it's private, not just unlisted).
  const nextIsShared = input.isShared ?? before.isShared;
  if ((before.isShared || nextIsShared) && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared views can edit one');
  }
  if (!before.isShared && before.createdById !== userId) {
    throw ApiError.forbidden('You can only edit your own saved views');
  }

  const [updated] = await db
    .update(savedViews)
    .set({
      name: input.name ?? before.name,
      filters: input.filters ?? before.filters,
      isShared: nextIsShared,
      updatedAt: new Date(),
    })
    .where(eq(savedViews.id, id))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'SavedView', entityId: id, oldValues: before, newValues: updated });
  return updated;
}

export async function deleteSavedView(req: Request, id: string): Promise<void> {
  const before = await getOwnedOrSharedSavedView(req, id);
  const userId = req.user!.sub;

  if (before.isShared && !canManageShared(req)) {
    throw ApiError.forbidden('Only users who can manage shared views can delete one');
  }
  if (!before.isShared && before.createdById !== userId) {
    throw ApiError.forbidden('You can only delete your own saved views');
  }

  await db.delete(savedViews).where(eq(savedViews.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'SavedView', entityId: id, oldValues: before });
}
