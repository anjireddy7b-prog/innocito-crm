import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './caseComments.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listCaseComments(orgId(req), req.query.caseId as string) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCaseComment(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCaseComment(req, req.params.id, req.body.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCaseComment(req, req.params.id);
  res.status(204).send();
});
