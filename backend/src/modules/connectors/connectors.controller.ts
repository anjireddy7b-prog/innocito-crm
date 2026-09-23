import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './connectors.service';

export const listProviders = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: service.listProviders() });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listConnectorInstances(req) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createConnectorInstance(req, req.body.providerId, req.body.name, req.body.config) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateConnectorInstance(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteConnectorInstance(req, req.params.id);
  res.status(204).send();
});
