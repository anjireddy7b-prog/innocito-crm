import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './validationRules.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = req.query as { entityType: string };
  res.json({ success: true, data: await service.listValidationRules(orgId(req), entityType) });
});
export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getValidationRuleById(orgId(req), req.params.id) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createValidationRule(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateValidationRule(req, req.params.id, req.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteValidationRule(req, req.params.id);
  res.status(204).send();
});
