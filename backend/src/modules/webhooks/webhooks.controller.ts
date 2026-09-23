import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './webhooks.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listWebhookEndpoints(req) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createWebhookEndpoint(req, req.body.url, req.body.eventTypes) });
});

export const toggle = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.toggleWebhookEndpoint(req, req.params.id, req.body.isActive) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteWebhookEndpoint(req, req.params.id);
  res.status(204).send();
});

export const deliveries = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listRecentDeliveries(req, req.params.id) });
});
