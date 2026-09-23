import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './reportBuilder.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = req.query as { entityType: string };
  res.json({ success: true, data: await service.listReportDefinitions(req, entityType) });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getReportDefinitionById(req, req.params.id) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createReportDefinition(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateReportDefinition(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteReportDefinition(req, req.params.id);
  res.status(204).send();
});

// Ad-hoc "preview before saving" run — same validated config shape as a saved definition, minus
// the name/description/isShared bookkeeping (see reportBuilder.validation.ts's runReportSchema).
export const runAdHoc = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.runReport(orgId(req), req.body) });
});

export const runSaved = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.runSavedReport(req, req.params.id) });
});
