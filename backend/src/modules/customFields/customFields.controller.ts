import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './customFields.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = req.query as { entityType: string };
  res.json({ success: true, data: await service.listCustomFieldDefinitions(orgId(req), entityType) });
});
export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCustomFieldDefinitionById(orgId(req), req.params.id) });
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCustomFieldDefinition(req, req.body) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCustomFieldDefinition(req, req.params.id, req.body) });
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCustomFieldDefinition(req, req.params.id);
  res.status(204).send();
});
