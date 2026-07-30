import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  jobTitle: z.string().max(150).optional(),
  roleName: z.enum(['ADMIN', 'INSIDE_SALES', 'SALES', 'DELIVERY', 'MANAGEMENT']),
  temporaryPassword: z.string().min(8).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
  jobTitle: z.string().max(150).optional().nullable(),
  roleName: z.enum(['ADMIN', 'INSIDE_SALES', 'SALES', 'DELIVERY', 'MANAGEMENT']).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).optional(),
});

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  roleName: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});
