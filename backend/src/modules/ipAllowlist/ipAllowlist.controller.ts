import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './ipAllowlist.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listEntries(req) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createEntry(req, req.body.cidr, req.body.label) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteEntry(req, req.params.id);
  res.status(204).send();
});
