import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import { isProd } from '@/config/env';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'refresh_token';

// Exported so organizations.controller.ts's signup handler — which issues a session the same
// way login does — sets the identical cookie rather than duplicating this config.
export function setRefreshCookie(res: Response, token: string) {
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

// Phase 15 (security hardening) — session/device management. Every handler below reads the raw
// refresh_token cookie itself (same REFRESH_COOKIE constant login/refresh/logout above use) only
// to identify the CALLER's own current session among their own rows — never to authenticate the
// request, which `authenticate` (see auth.routes.ts) has already done via the Bearer access
// token. A caller with no refresh cookie at all (e.g. an access token used past its refresh
// cookie's own lifetime) still gets a full session list back, just with no row flagged `current`.
export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const currentToken = req.cookies?.[REFRESH_COOKIE];
  const sessions = await authService.listSessions(req.user!.sub, currentToken);
  res.json({ success: true, data: sessions });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  await authService.revokeSession(req, req.user!.sub, req.params.id);
  res.json({ success: true, data: null });
});

export const revokeOtherSessions = asyncHandler(async (req: Request, res: Response) => {
  const currentToken = req.cookies?.[REFRESH_COOKIE];
  const result = await authService.revokeOtherSessions(req, req.user!.sub, currentToken);
  res.json({ success: true, data: result });
});

// Phase 13 (super admin), slice 2. Only reachable with an impersonation token — see this route's
// own comment in auth.routes.ts for why that's checked here rather than via requirePlatformAdmin
// (an impersonation token deliberately never satisfies that gate).
export const endImpersonation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.impersonation) throw ApiError.forbidden('Not an impersonation session');
  await authService.endImpersonation(req, req.user.sub, req.user.organizationId, req.user.impersonation);
  res.json({ success: true, data: null });
});
