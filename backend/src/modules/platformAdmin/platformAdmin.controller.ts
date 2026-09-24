import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './platformAdmin.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listOrganizations(req.query as any);
  res.json({ success: true, data: result.data, meta: result.meta });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getOrganizationDetail(req.params.id) });
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.setOrganizationActive(req, req.params.id, req.body.isActive) });
});

export const impersonate = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.impersonateUser(req, req.params.userId) });
});

export const metrics = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getPlatformMetrics() });
});
