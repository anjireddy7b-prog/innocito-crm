import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const sequenceStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const createSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
});

export const updateSequenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  // Activating requires >=1 step (checked in the service, not here — a schema can't see the DB).
  // Archiving also exits every non-terminal enrollment — see sequences.service.ts's module comment.
  status: sequenceStatusSchema.optional(),
});

export const listSequencesQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: sequenceStatusSchema.optional(),
});

export const createStepSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  // Business days after the PREVIOUS step was sent (or after enrollment, for the first step).
  // 0 is valid (send immediately, subject to the send window) — see utils/sequenceScheduling.ts.
  delayDays: z.coerce.number().int().min(0).max(90).default(0),
});

export const updateStepSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  delayDays: z.coerce.number().int().min(0).max(90).optional(),
});

export const moveStepSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export const enrollLeadSchema = z.object({
  leadId: z.string().uuid(),
});

export const listEnrollmentsQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXITED']).optional(),
});
