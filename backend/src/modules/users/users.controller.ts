import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import * as usersService from './users.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.listUsers(req.query as any);
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUserById(req.params.id);
  res.json({ success: true, data: user });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.createUser(req, req.body);
  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.updateUser(req, req.params.id, req.body);
  res.json({ success: true, data: user });
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setUserActive(req, req.params.id, req.body.isActive);
  res.json({ success: true, data: user });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.resetPassword(req, req.params.id, req.body.newPassword);
  res.json({ success: true, data: result });
});

export const assignable = asyncHandler(async (req: Request, res: Response) => {
  const roles = typeof req.query.roles === 'string' ? req.query.roles.split(',') : undefined;
  const users = await usersService.listAssignableUsers(roles);
  res.json({ success: true, data: users });
});
