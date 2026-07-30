import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export function paginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasNextPage: page * pageSize < total,
    hasPrevPage: page > 1,
  };
}

export function toSkipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Drizzle's relational query API (db.query.x.findMany) expects `limit`/`offset` keys, not Prisma-style `skip`/`take`. */
export function toLimitOffset(page: number, pageSize: number) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}
