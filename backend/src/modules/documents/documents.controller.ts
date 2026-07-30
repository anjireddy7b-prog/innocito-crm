import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import * as service from './documents.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listDocuments(req.query as any) });
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  res.status(201).json({ success: true, data: await service.uploadDocument(req, req.file, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteDocument(req, req.params.id);
  res.status(204).send();
});
