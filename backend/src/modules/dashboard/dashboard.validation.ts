import { z } from 'zod';

/**
 * Query params for GET /dashboard/summary.
 *
 * period=all (default) → unchanged, all-time summary (identical to the original behavior).
 * period=year          → requires `year`.
 * period=quarter        → requires `year` + `quarter` (1-4).
 * period=month           → requires `year` + `month` (1-12).
 */
export const dashboardSummaryQuerySchema = z
  .object({
    period: z.enum(['all', 'year', 'quarter', 'month']).optional().default('all'),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((v) => v.period === 'all' || v.year !== undefined, {
    message: 'year is required when period is year, quarter, or month',
    path: ['year'],
  })
  .refine((v) => v.period !== 'quarter' || v.quarter !== undefined, {
    message: 'quarter is required when period is quarter',
    path: ['quarter'],
  })
  .refine((v) => v.period !== 'month' || v.month !== undefined, {
    message: 'month is required when period is month',
    path: ['month'],
  });

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
