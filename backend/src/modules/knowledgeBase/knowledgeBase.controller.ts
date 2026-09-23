import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import { PERMISSIONS } from '@/utils/permissions';
import * as service from './knowledgeBase.service';

function canManage(req: Request): boolean {
  return req.user!.permissions.includes(PERMISSIONS.KNOWLEDGE_BASE_MANAGE);
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listArticles(orgId(req), req.query as any, canManage(req));
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getArticleById(orgId(req), req.params.id, canManage(req)) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createArticle(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateArticle(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteArticle(req, req.params.id);
  res.status(204).send();
});
