import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const upsertCompanySchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().max(255).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
  industry: z.string().max(150).optional().nullable(),
  companySize: z.string().max(50).optional().nullable(),
  annualRevenue: z.coerce.number().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  addressLine: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  linkedinUrl: z.string().max(255).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const listCompaniesQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
});
