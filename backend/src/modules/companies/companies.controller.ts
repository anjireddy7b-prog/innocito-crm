import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import * as service from './companies.service';
import * as importService from './companies.import.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listCompanies(orgId(req), req.query as any);
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCompanyById(orgId(req), req.params.id) });
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

export const importFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded — attach a .csv or .xlsx file.');
  const result = await importService.importCompaniesFromFile(req, req.file);
  res.json({ success: true, data: result });
});
