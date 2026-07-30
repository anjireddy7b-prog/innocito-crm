import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './companies.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listCompanies(req.query as any);
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCompanyById(req.params.id) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCompany(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCompany(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCompany(req, req.params.id);
  res.status(204).send();
});
