import { z } from 'zod';

// Phase 10 (reporting/dashboard builder), slice 2 — pinning a saved custom report onto the
// caller's own personal dashboard. See db/schema.ts's dashboardWidgets table comment for why this
// has no isShared/ownership model of its own: it's always scoped to the caller (req.user!.sub),
// never a param.

export const pinReportSchema = z.object({
  reportDefinitionId: z.string().uuid(),
});

// Reordering is "send the whole list back in the order you want it displayed" rather than a
// single move-up/move-down — simpler to validate (the set of ids must exactly match the caller's
// current widgets, see dashboardWidgets.service.ts's reorderWidgets) and simpler for the frontend
// to drive from a plain array of widget ids.
export const reorderWidgetsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
