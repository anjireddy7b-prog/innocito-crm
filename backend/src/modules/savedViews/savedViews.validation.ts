import { z } from 'zod';

// Phase 7 ("custom views/nav" per Section K's superseding 15-phase breakdown): saved list-page
// filter/sort presets. Deliberately LEAD-only for now (see db/schema.ts's savedViews table
// comment) — entityType stays a plain string column, not hardcoded to a literal, so a future
// entity or a custom object can adopt this later without a schema change; only the Zod shape
// below restricts what's accepted today.
export const savedViewEntityTypeSchema = z.literal('LEAD');

// The list page's own query-string params, stored as a plain string-to-string bag and replayed
// back into URLSearchParams verbatim (see LeadsListPage.tsx / api/savedViews.ts) — every key
// optional, every value a plain string, exactly what a URLSearchParams round-trip produces. Not
// validated key-by-key against LEAD_STATUSES/LEAD_SOURCES/etc. here: an unrecognized or stale
// value in a saved filter just yields zero rows when replayed (the same as hand-editing the URL
// to a stale value would) — not worth rejecting at save time, and it keeps this schema from
// needing to change every time the Leads list gains or renames a filter.
export const savedViewFiltersSchema = z.record(z.string(), z.string()).default({});

export const listSavedViewsQuerySchema = z.object({
  entityType: savedViewEntityTypeSchema.default('LEAD'),
});

export const createSavedViewSchema = z.object({
  entityType: savedViewEntityTypeSchema.default('LEAD'),
  name: z.string().trim().min(1).max(150),
  filters: savedViewFiltersSchema,
  // Personal (default) or shared with the whole organization — see savedViews.service.ts for the
  // SAVED_VIEWS_MANAGE_SHARED check this triggers.
  isShared: z.boolean().default(false),
});

export const updateSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  filters: savedViewFiltersSchema.optional(),
  isShared: z.boolean().optional(),
});
