import { z } from 'zod';
import { ALL_PERMISSIONS } from '@/utils/permissions';

// Cast for zod's benefit only (mirrors the existing ROLE_NAMES pattern elsewhere in this
// codebase) — ALL_PERMISSIONS is a real, non-empty array at runtime, so this enum always has at
// least the fixed catalog's own keys to validate against.
const permissionKeySchema = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  // A role with zero permissions is valid (e.g. a placeholder role being set up before its
  // grants are decided) — it just can't do anything yet.
  permissionKeys: z.array(permissionKeySchema).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  permissionKeys: z.array(permissionKeySchema).optional(),
});
