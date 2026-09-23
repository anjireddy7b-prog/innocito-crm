import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { ALL_PERMISSIONS, PERMISSION_DESCRIPTIONS, PERMISSIONS } from '@/utils/permissions';

export const permissionsRouter = Router();

permissionsRouter.use(authenticate);

/**
 * Phase 3: the fixed, global catalog of permission keys a role can be granted (never
 * tenant-scoped — see the Architecture Report — because each key is tied to an actual
 * code-enforced gate, not admin-editable data). Powers the role editor's permission checklist.
 * Same gate as the roles list itself: either ROLES_VIEW/ROLES_MANAGE (the roles-management
 * screen) or USERS_MANAGE (so the user-creation role picker can still resolve permission labels).
 *
 * Phase 11, slice 1: also gated on API_KEYS_MANAGE, so the API key creation dialog's permission
 * picker still resolves labels for a hypothetical future custom role that holds API_KEYS_MANAGE
 * without any of the other three (every DEFAULT role that holds it — ADMIN — already holds
 * ROLES_VIEW etc. too, so this only matters for a custom role an org creates later).
 */
permissionsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.API_KEYS_MANAGE),
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: ALL_PERMISSIONS.map((key) => ({ key, description: PERMISSION_DESCRIPTIONS[key] })),
    });
  })
);
