import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

// Phase 13 (super admin), slice 1 — organization management console.
export const listOrganizationsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const setOrganizationActiveSchema = z.object({
  isActive: z.boolean(),
});
