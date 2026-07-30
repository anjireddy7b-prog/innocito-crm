import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './campaigns.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, ...(await service.listCampaigns(req.query as any)) });
});
export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCampaignById(req.params.id) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCampaign(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCampaign(req, req.params.id, req.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCampaign(req, req.params.id);
  res.status(204).send();
});
