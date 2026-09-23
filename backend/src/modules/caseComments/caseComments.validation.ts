import { z } from 'zod';

export const createCaseCommentSchema = z.object({
  caseId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

export const updateCaseCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});
