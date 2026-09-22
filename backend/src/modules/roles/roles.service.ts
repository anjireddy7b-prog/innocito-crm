import { Request } from 'express';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/config/db';
import { permissions, rolePermissions, roles, users } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { PermissionKey } from '@/utils/permissions';

type ShapedRole = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: string[];
};

function shape(role: { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date; permissions: { permission: { key: string } }[] }): ShapedRole {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.permissions.map((rp) => rp.permission.key),
  };
}

async function findRole(org: string, id: string): Promise<ShapedRole | null> {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.organizationId, org), eq(roles.id, id)),
    with: { permissions: { with: { permission: true } } },
  });
  return role ? shape(role) : null;
}

/** Replaces a role's entire permission set. Delete-then-insert rather than a diff: roles rarely
 * hold more than a couple dozen grants, so this is simple and always correct, at the cost of a
 * (harmless) row churn on every save. Silently ignores any key not found in the global catalog —
 * validation already restricts input to ALL_PERMISSIONS, so that can only happen if the catalog
 * itself is mid-deploy and hasn't been seeded with a brand-new key yet. */
async function setRolePermissions(roleId: string, permissionKeys: PermissionKey[]) {
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (!permissionKeys.length) return;
  const permissionRows = await db.query.permissions.findMany({ where: inArray(permissions.key, permissionKeys) });
  if (permissionRows.length) {
    await db.insert(rolePermissions).values(permissionRows.map((p) => ({ roleId, permissionId: p.id })));
  }
}

export async function listRoles(org: string): Promise<ShapedRole[]> {
  const rows = await db.query.roles.findMany({
    where: eq(roles.organizationId, org),
    with: { permissions: { with: { permission: true } } },
    orderBy: asc(roles.name),
  });
  return rows.map(shape);
}

export async function getRoleById(org: string, id: string): Promise<ShapedRole> {
  const role = await findRole(org, id);
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

export async function createRole(
  req: Request,
  input: { name: string; description?: string | null; permissionKeys: PermissionKey[] }
): Promise<ShapedRole> {
  const org = orgId(req);
  const existing = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, org), eq(roles.name, input.name)) });
  if (existing) throw ApiError.conflict('A role with this name already exists');

  const [created] = await db
    .insert(roles)
    .values({ organizationId: org, name: input.name, description: input.description ?? null })
    .returning();

  await setRolePermissions(created.id, input.permissionKeys);
  const role = await findRole(org, created.id);

  await recordAudit({ req, action: 'CREATE', entityType: 'Role', entityId: created.id, newValues: role });
  return role!;
}

export async function updateRole(
  req: Request,
  id: string,
  input: { name?: string; description?: string | null; permissionKeys?: PermissionKey[] }
): Promise<ShapedRole> {
  const org = orgId(req);
  const before = await findRole(org, id);
  if (!before) throw ApiError.notFound('Role not found');

  if (input.name && input.name !== before.name) {
    const clash = await db.query.roles.findFirst({
      where: and(eq(roles.organizationId, org), eq(roles.name, input.name), ne(roles.id, id)),
    });
    if (clash) throw ApiError.conflict('A role with this name already exists');
  }

  await db
    .update(roles)
    .set({
      name: input.name ?? before.name,
      description: input.description === undefined ? before.description : input.description,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, id));

  if (input.permissionKeys) {
    await setRolePermissions(id, input.permissionKeys);
  }

  const after = await findRole(org, id);

  await recordAudit({
    req,
    action: input.permissionKeys ? 'ROLE_CHANGED' : 'UPDATE',
    entityType: 'Role',
    entityId: id,
    oldValues: before,
    newValues: after,
  });
  return after!;
}

/**
 * Deletes a role. Refuses (409) while any user in the organization still holds it — deleting an
 * in-use role would otherwise leave that user's `roleId` dangling and their JWT unable to resolve
 * permissions on next login. Reassign or deactivate those users first.
 */
export async function deleteRole(req: Request, id: string): Promise<void> {
  const org = orgId(req);
  const before = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, org), eq(roles.id, id)) });
  if (!before) throw ApiError.notFound('Role not found');

  const [{ value: usersWithRole }] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
  if (Number(usersWithRole) > 0) {
    throw ApiError.conflict(`Cannot delete this role — ${usersWithRole} user(s) are still assigned to it`);
  }

  await db.delete(roles).where(eq(roles.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Role', entityId: id, oldValues: before });
}
