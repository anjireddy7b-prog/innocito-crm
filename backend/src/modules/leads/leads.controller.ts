import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as service from './leads.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, ...(await service.listLeads(req.query as any)) });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getLeadById(req.params.id) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createLead(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateLead(req, req.params.id, req.body) });
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.assignLead(req, req.params.id, req.body) });
});

export const bulkAssign = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.bulkAssignLeads(req, req.body) });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.changeLeadStatus(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteLead(req, req.params.id);
  res.status(204).send();
});
