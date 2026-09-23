import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './duplicates.service';
import { DuplicateEntityType } from './duplicates.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = req.query as { entityType: DuplicateEntityType };
  res.json({ success: true, data: await service.listDuplicateGroups(orgId(req), entityType) });
});

export const merge = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.mergeDuplicates(req, req.body) });
});
