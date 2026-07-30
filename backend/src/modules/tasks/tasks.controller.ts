import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './tasks.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listTasks(req.query as any) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createTask(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateTask(req, req.params.id, req.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteTask(req, req.params.id);
  res.status(204).send();
});
