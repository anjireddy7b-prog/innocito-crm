import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './contacts.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, ...(await service.listContacts(req.query as any)) });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getContactById(req.params.id) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createContact(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateContact(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteContact(req, req.params.id);
  res.status(204).send();
});
