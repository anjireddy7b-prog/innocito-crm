import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';
import { websiteSchema } from '@/utils/leadFormOptions';

// Industry/Country are curated dropdowns in the UI (see leadFormOptions.ts on both sides), but are
// intentionally kept as plain strings here rather than a strict z.enum(). Companies created before
// these lists existed (imports, legacy free text) can have values outside the curated set — a hard
// server-side enum would reject re-saving one of those companies over an unrelated field edit. The
// curated list is enforced where data actually gets entered (the dropdowns), not retroactively here.
export const upsertCompanySchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().max(255).optional().nullable(),
  website: websiteSchema,
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
