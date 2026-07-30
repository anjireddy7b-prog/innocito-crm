import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import { isProd } from '@/config/env';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'refresh_token';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(req, email, password);
  setRefreshCookie(res, result.refreshToken);
  res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Missing refresh token');
  const result = await authService.refresh(req, token);
  setRefreshCookie(res, result.refreshToken);
  res.json({ success: true, data: { accessToken: result.accessToken } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ success: true, data: null });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getCurrentUser(req.user!.sub);
  res.json({ success: true, data: user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req, req.user!.sub, currentPassword, newPassword);
  res.json({ success: true, message: 'Password updated successfully' });
});
