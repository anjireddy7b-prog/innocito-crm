import { z } from 'zod';

// Phase 14 (AI), email/sequence drafting assistant. `instructions` is the only required field —
// everything else is optional context that sharpens the draft but that a caller might not have
// (e.g. drafting a brand-new sequence's first step, before any step numbering exists yet).
export const draftEmailSchema = z.object({
  instructions: z.string().trim().min(1, 'Tell the assistant what this email should do').max(2000),
  sequenceName: z.string().trim().max(200).optional(),
  stepNumber: z.coerce.number().int().min(1).max(50).optional(),
});

// Phase 14 (AI), conversational CRM assistant. Stateless by design (see ai.service.ts's own
// comment) — the caller resends the whole visible transcript every turn, capped well below any
// context-window concern for a chat this size.
export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});
