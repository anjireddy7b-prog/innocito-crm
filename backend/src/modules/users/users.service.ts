import argon2 from 'argon2';
import crypto from 'crypto';
import { Request } from 'express';
import { and, asc, desc, eq, ilike, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, roles } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';

function generateTempPassword(): string {
  const raw = crypto.randomBytes(9).toString('base64url');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}!1`;
}

const userColumns = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  jobTitle: true,
  avatarUrl: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsers(query: {
  page: number;
  pageSize: number;
  search?: string;
  roleName?: string;
  isActive?: boolean;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [];
  if (query.search) {
    conditions.push(
      or(
        ilike(users.firstName, `%${query.search}%`),
        ilike(users.lastName, `%${query.search}%`),
        ilike(users.email, `%${query.search}%`)
      )!
    );
  }
  if (query.isActive !== undefined) conditions.push(eq(users.isActive, query.isActive));

  let roleId: string | undefined;
  if (query.roleName) {
    const role = await db.query.roles.findFirst({ where: eq(roles.name, query.roleName as any) });
    roleId = role?.id;
    if (roleId) conditions.push(eq(users.roleId, roleId));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const sortable: Record<string, any> = { firstName: users.firstName, lastName: users.lastName, email: users.email, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt };
  const orderCol = sortable[query.sortBy ?? ''] ?? users.createdAt;
  const orderBy = query.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, [{ value: total }]] = await Promise.all([
    db.query.users.findMany({
      where,
      columns: userColumns,
      with: { role: { columns: { id: true, name: true } }, createdBy: { columns: { id: true, firstName: true, lastName: true } } },
      orderBy,
      ...toLimitOffset(query.page, query.pageSize),
    }),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return { data: rows, meta: paginationMeta(Number(total), query.page, query.pageSize) };
}

export async function getUserById(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: userColumns,
    with: { role: { columns: { id: true, name: true } }, createdBy: { columns: { id: true, firstName: true, lastName: true } } },
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function createUser(
  req: Request,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    jobTitle?: string;
    roleName: string;
    temporaryPassword?: string;
  }
) {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, input.roleName as any) });
  if (!role) throw ApiError.badRequest('Unknown role');

  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email.toLowerCase()) });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const tempPassword = input.temporaryPassword ?? generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword);

  const [created] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      jobTitle: input.jobTitle,
      roleId: role.id,
      passwordHash,
      mustChangePassword: true,
      createdById: req.user!.sub,
    })
    .returning();

  const user = await getUserById(created.id);
  await recordAudit({ req, action: 'CREATE', entityType: 'User', entityId: user.id, newValues: user });

  return { user, temporaryPassword: tempPassword };
}

export async function updateUser(
  req: Request,
  id: string,
  input: { firstName?: string; lastName?: string; phone?: string | null; jobTitle?: string | null; roleName?: string }
) {
  const before = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!before) throw ApiError.notFound('User not found');

  let roleId: string | undefined;
  if (input.roleName) {
    const role = await db.query.roles.findFirst({ where: eq(roles.name, input.roleName as any) });
    if (!role) throw ApiError.badRequest('Unknown role');
    roleId = role.id;
  }

  await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone === null ? null : input.phone,
      jobTitle: input.jobTitle === null ? null : input.jobTitle,
      roleId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  const user = await getUserById(id);

  await recordAudit({
    req,
    action: input.roleName ? 'ROLE_CHANGED' : 'UPDATE',
    entityType: 'User',
    entityId: id,
    oldValues: { firstName: before.firstName, lastName: before.lastName, roleId: before.roleId },
    newValues: user,
  });

  return user;
}

export async function setUserActive(req: Request, id: string, isActive: boolean) {
  if (id === req.user!.sub && !isActive) {
    throw ApiError.badRequest('You cannot disable your own account');
  }
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  const user = await getUserById(id);
  await recordAudit({ req, action: 'UPDATE', entityType: 'User', entityId: id, newValues: { isActive } });
  return user;
}

export async function resetPassword(req: Request, id: string, newPassword?: string) {
  const tempPassword = newPassword ?? generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword);
  await db.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  await recordAudit({ req, action: 'PASSWORD_RESET', entityType: 'User', entityId: id });
  return { temporaryPassword: tempPassword };
}

/** Lightweight list for assignment dropdowns (active users only, minimal fields). */
export async function listAssignableUsers(roleNames?: string[]) {
  const conditions: SQL[] = [eq(users.isActive, true)];
  const rows = await db.query.users.findMany({
    where: and(...conditions),
    columns: { id: true, firstName: true, lastName: true, email: true },
    with: { role: { columns: { name: true } } },
    orderBy: asc(users.firstName),
  });
  return roleNames?.length ? rows.filter((u) => roleNames.includes(u.role.name)) : rows;
}
