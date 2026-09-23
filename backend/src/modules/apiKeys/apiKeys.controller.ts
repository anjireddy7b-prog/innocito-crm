import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './apiKeys.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listApiKeys(req) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createApiKey(req, req.body.name, req.body.permissionKeys) });
});

export const revoke = asyncHandler(async (req: Request, res: Response) => {
  await service.revokeApiKey(req, req.params.id);
  res.status(204).send();
});
