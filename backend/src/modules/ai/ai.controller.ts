import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './ai.service';

export const generateInsights = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.generateLeadInsights(req, req.params.id) });
});

export const draftEmail = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.draftSequenceEmail(req, req.body) });
});

export const chat = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.runAiChat(req, req.body.messages) });
});
