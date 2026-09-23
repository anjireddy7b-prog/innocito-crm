import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './dashboardWidgets.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listMyWidgets(req) });
});

export const pin = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.pinReport(req, req.body.reportDefinitionId) });
});

export const unpin = asyncHandler(async (req: Request, res: Response) => {
  await service.unpinWidget(req, req.params.id);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.reorderWidgets(req, req.body.orderedIds) });
});
