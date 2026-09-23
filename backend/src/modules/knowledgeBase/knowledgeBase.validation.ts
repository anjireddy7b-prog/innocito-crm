import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

export const articleStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

export const createArticleSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.string().max(150).optional().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
  content: z.string().min(1),
  status: articleStatusSchema.default('DRAFT'),
});

export const updateArticleSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  category: z.string().max(150).optional().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  content: z.string().min(1).optional(),
  status: articleStatusSchema.optional(),
});

export const listArticlesQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  category: z.string().optional(),
  status: articleStatusSchema.optional(),
});
