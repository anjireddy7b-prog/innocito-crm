import { z } from 'zod';

export const createTaskSchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedToId: z.string().uuid().optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED']).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export const listTasksQuerySchema = z.object({
  leadId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  status: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
});
