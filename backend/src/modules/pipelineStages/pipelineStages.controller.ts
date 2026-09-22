import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './pipelineStages.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listPipelineStages(orgId(req)) });
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updatePipelineStage(req, req.params.id, req.body) });
});
