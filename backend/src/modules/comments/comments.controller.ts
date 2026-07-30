import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './comments.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listComments(req.query.leadId as string) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createComment(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateComment(req, req.params.id, req.body.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteComment(req, req.params.id);
  res.status(204).send();
});
