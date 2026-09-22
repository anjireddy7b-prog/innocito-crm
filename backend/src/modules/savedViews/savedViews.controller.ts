import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './savedViews.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = req.query as { entityType: string };
  res.json({ success: true, data: await service.listSavedViews(req, entityType) });
});
export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getSavedViewById(req, req.params.id) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createSavedView(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateSavedView(req, req.params.id, req.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSavedView(req, req.params.id);
  res.status(204).send();
});
