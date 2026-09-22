import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  jobTitle: z.string().max(150).optional(),
  // Phase 3: roles are tenant-scoped, admin-editable data, so a fixed 5-name enum can no longer
  // describe every role that might exist — the caller now names the org's own role by id
  // (users.service.ts resolves and validates it belongs to the caller's organization).
  roleId: z.string().uuid('Select a role'),
  temporaryPassword: z.string().min(8).optional(),
});

export const updateUserSchema = z.object({
  // Admin-editable: the Email ID is this user's primary address for every system-generated
  // notification (lead assignment, status changes, task/meeting alerts, etc. — see
  // utils/notifier.ts). Changing it here takes effect immediately and is audit-logged
  // (see users.service.ts's updateUser()); uniqueness is enforced case-insensitively below.
  email: z.string().email('Enter a valid email').max(255).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
  jobTitle: z.string().max(150).optional().nullable(),
  roleId: z.string().uuid().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).optional(),
});

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});
