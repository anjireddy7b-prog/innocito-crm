import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './customObjects.service';

export const listDefinitions = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listCustomObjectDefinitions(orgId(req)) });
});
export const getDefinitionById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCustomObjectDefinitionById(orgId(req), req.params.definitionId) });
});
export const createDefinition = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCustomObjectDefinition(req, req.body) });
});
export const updateDefinition = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCustomObjectDefinition(req, req.params.definitionId, req.body) });
});
export const removeDefinition = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCustomObjectDefinition(req, req.params.definitionId);
  res.status(204).send();
});

export const listRecords = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, ...(await service.listCustomObjectRecords(orgId(req), req.params.definitionId, req.query as any)) });
});
export const getRecordById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getCustomObjectRecordById(orgId(req), req.params.definitionId, req.params.recordId) });
});
export const createRecord = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createCustomObjectRecord(req, req.params.definitionId, req.body) });
});
export const updateRecord = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateCustomObjectRecord(req, req.params.definitionId, req.params.recordId, req.body) });
});
export const removeRecord = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCustomObjectRecord(req, req.params.definitionId, req.params.recordId);
  res.status(204).send();
});
