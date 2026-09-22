import { z } from 'zod';

// Create/delete of brand-new stages is deliberately out of scope this phase — see the
// `pipelineStages` table comment in db/schema.ts. Only what an org's existing 13 seeded rows can
// be edited to: rename, reorder, and flip the won/lost/terminal flags. `key` is never editable —
// it's what dashboard.service.ts and leads.service.ts join their business logic against (see the
// isTerminal check gating lossReason), so renaming it out from under them would silently break
// win/loss reporting for existing data.
export const updatePipelineStageSchema = z.object({
  label: z.string().trim().min(1).max(150).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
});
