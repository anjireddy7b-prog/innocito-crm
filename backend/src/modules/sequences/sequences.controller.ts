import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { orgId } from '@/utils/tenant';
import * as service from './sequences.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listSequences(orgId(req), req.query as any);
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getSequenceById(orgId(req), req.params.id) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createSequence(req, req.body) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateSequence(req, req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSequence(req, req.params.id);
  res.status(204).send();
});

export const createStep = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.createStep(req, req.params.id, req.body) });
});

export const updateStep = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateStep(req, req.params.id, req.params.stepId, req.body) });
});

export const removeStep = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.deleteStep(req, req.params.id, req.params.stepId) });
});

export const moveStep = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.moveStep(req, req.params.id, req.params.stepId, req.body.direction) });
});

export const listEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listEnrollments(orgId(req), req.params.id, req.query as any);
  res.json({ success: true, ...result });
});

export const enroll = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await service.enrollLead(req, req.params.id, req.body.leadId) });
});

export const pauseEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.pauseEnrollment(req, req.params.enrollmentId) });
});

export const resumeEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.resumeEnrollment(req, req.params.enrollmentId) });
});

export const exitEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.exitEnrollment(req, req.params.enrollmentId) });
});
