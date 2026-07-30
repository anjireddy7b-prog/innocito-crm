import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const upsertContactSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  firstName: z.string().min(1).max(150),
  lastName: z.string().min(1).max(150),
  designation: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(30).optional().nullable(),
  linkedinUrl: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const listContactsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
