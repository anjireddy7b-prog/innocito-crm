import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const upsertCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(20).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  budget: z.coerce.number().optional().nullable(),
});

export const listCampaignsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
});
