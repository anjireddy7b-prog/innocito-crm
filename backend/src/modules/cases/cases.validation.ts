import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const caseStatusSchema = z.enum(['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED']);
export const casePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const createCaseSchema = z.object({
  subject: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  priority: casePrioritySchema.default('MEDIUM'),
  assignedToId: z.string().uuid().optional().nullable(),
});

// status is only ever changed through this same PATCH endpoint (no separate "transition"
// endpoint) — see cases.service.ts's updateCase() for the resolvedAt/closedAt side effects that
// fire off a status change, mirroring tasks.service.ts's completedAt-on-COMPLETED pattern.
export const updateCaseSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  status: caseStatusSchema.optional(),
  priority: casePrioritySchema.optional(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export const listCasesQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(), // comma-separated list of caseStatusSchema values
  priority: z.string().optional(), // comma-separated list of casePrioritySchema values
  assignedToId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});
