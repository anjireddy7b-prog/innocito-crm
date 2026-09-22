import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { setRefreshCookie } from '@/modules/auth/auth.controller';
import * as organizationsService from './organizations.service';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const result = await organizationsService.signup(req, req.body);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    success: true,
    data: { organization: result.organization, accessToken: result.accessToken, user: result.user },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const org = await organizationsService.getMyOrganization(req);
  res.json({ success: true, data: { id: org.id, name: org.name, slug: org.slug, isActive: org.isActive } });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const org = await organizationsService.updateMyOrganization(req, req.body);
  res.json({ success: true, data: { id: org.id, name: org.name, slug: org.slug, isActive: org.isActive } });
});
