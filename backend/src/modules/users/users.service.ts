import argon2 from 'argon2';
import crypto from 'crypto';
import { Request } from 'express';
import { and, asc, desc, eq, ilike, ne, or, count, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, roles } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { paginationMeta, toLimitOffset } from '@/utils/pagination';
import { orgId } from '@/utils/tenant';
import { sendWelcomeEmail, sendPasswordResetEmail } from '@/utils/accountEmails';

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

export async function listUsers(org: string, query: {
  page: number;
  pageSize: number;
  search?: string;
  roleId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}) {
  const conditions: SQL[] = [eq(users.organizationId, org)];
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
  // Phase 3: filtering by roleId directly (rather than resolving a roleName first) needs no
  // extra org-ownership check here — it's combined with the eq(users.organizationId, org)
  // condition above, and every user's own roleId already points at a role in their own
  // organization, so a roleId from another org simply matches zero rows rather than leaking one.
  if (query.roleId) conditions.push(eq(users.roleId, query.roleId));

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

export async function getUserById(org: string, id: string) {
  const user = await db.query.users.findFirst({
    where: and(eq(users.organizationId, org), eq(users.id, id)),
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
    roleId: string;
    temporaryPassword?: string;
  }
) {
  const org = orgId(req);
  // Phase 3: roles are tenant-scoped, so this lookup must confirm the role actually belongs to
  // the caller's own organization — without the organizationId condition, a caller could pass
  // another organization's roleId (a real cross-tenant privilege risk, not just a 404).
  const role = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, org), eq(roles.id, input.roleId)) });
  if (!role) throw ApiError.badRequest('Unknown role');

  // NOTE: email uniqueness stays platform-wide in Phase 1 (users.email has a global unique
  // constraint — see db/schema.ts) rather than per-organization; narrowing it is deferred to
  // when a second real organization actually needs the same email, per the incremental-change
  // rule in the Architecture Report's Migration Plan (the same deferral as campaigns.code).
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email.toLowerCase()) });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const tempPassword = input.temporaryPassword ?? generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword);

  const [created] = await db
    .insert(users)
    .values({
      organizationId: org,
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

  const user = await getUserById(org, created.id);
  await recordAudit({ req, action: 'CREATE', entityType: 'User', entityId: user.id, newValues: user });

  // Best-effort (sendEmail/sendWelcomeEmail never throw — see utils/emailer.ts) — the temporary
  // password is still returned below either way, so a failed or unconfigured send never leaves the
  // Admin with no way to hand it to the new hire.
  await sendWelcomeEmail({ to: user.email, firstName: user.firstName, temporaryPassword: tempPassword });

  return { user, temporaryPassword: tempPassword };
}

export async function updateUser(
  req: Request,
  id: string,
  input: { email?: string; firstName?: string; lastName?: string; phone?: string | null; jobTitle?: string | null; roleId?: string }
) {
  const org = orgId(req);
  const before = await db.query.users.findFirst({ where: and(eq(users.organizationId, org), eq(users.id, id)) });
  if (!before) throw ApiError.notFound('User not found');

  let roleId: string | undefined;
  if (input.roleId) {
    // Same cross-tenant guard as createUser: confirm the role belongs to this organization
    // before letting a user be repointed to it.
    const role = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, org), eq(roles.id, input.roleId)) });
    if (!role) throw ApiError.badRequest('Unknown role');
    roleId = role.id;
  }

  // Email ID — this is the address every system-generated notification is sent to (see
  // utils/notifier.ts, which always reads it fresh rather than caching it anywhere). Normalize
  // case the same way login/creation do, and only touch it — or check uniqueness — when it's
  // actually changing, so re-submitting the form with the same email is always a no-op here.
  let newEmail: string | undefined;
  const emailChanged = input.email !== undefined && input.email.toLowerCase() !== before.email.toLowerCase();
  if (emailChanged) {
    newEmail = input.email!.toLowerCase();
    const existing = await db.query.users.findFirst({
      where: and(eq(users.email, newEmail), ne(users.id, id)),
    });
    if (existing) throw ApiError.conflict('A user with this email already exists');
  }

  await db
    .update(users)
    .set({
      ...(newEmail !== undefined ? { email: newEmail } : {}),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone === null ? null : input.phone,
      jobTitle: input.jobTitle === null ? null : input.jobTitle,
      roleId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  const user = await getUserById(org, id);

  await recordAudit({
    req,
    action: input.roleId ? 'ROLE_CHANGED' : 'UPDATE',
    entityType: 'User',
    entityId: id,
    oldValues: { firstName: before.firstName, lastName: before.lastName, roleId: before.roleId },
    newValues: user,
  });

  // A dedicated, always-present audit entry for Email ID changes specifically — kept separate from
  // the general UPDATE/ROLE_CHANGED entry above (which can be about anything) so "who changed this
  // user's notification email, and when, and from what to what" is never buried in a generic diff.
  if (emailChanged) {
    await recordAudit({
      req,
      action: 'EMAIL_CHANGED',
      entityType: 'User',
      entityId: id,
      oldValues: { email: before.email },
      newValues: { email: newEmail },
    });
  }

  return user;
}

export async function setUserActive(req: Request, id: string, isActive: boolean) {
  if (id === req.user!.sub && !isActive) {
    throw ApiError.badRequest('You cannot disable your own account');
  }
  const org = orgId(req);
  const existing = await db.query.users.findFirst({ where: and(eq(users.organizationId, org), eq(users.id, id)) });
  if (!existing) throw ApiError.notFound('User not found');
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  const user = await getUserById(org, id);
  await recordAudit({ req, action: 'UPDATE', entityType: 'User', entityId: id, newValues: { isActive } });
  return user;
}

export async function resetPassword(req: Request, id: string, newPassword?: string) {
  const org = orgId(req);
  const existing = await db.query.users.findFirst({ where: and(eq(users.organizationId, org), eq(users.id, id)) });
  if (!existing) throw ApiError.notFound('User not found');
  const tempPassword = newPassword ?? generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword);
  await db.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  await recordAudit({ req, action: 'PASSWORD_RESET', entityType: 'User', entityId: id });

  // Same best-effort contract as createUser's welcome email above.
  await sendPasswordResetEmail({ to: existing.email, firstName: existing.firstName, temporaryPassword: tempPassword });

  return { temporaryPassword: tempPassword };
}

/** Lightweight list for assignment dropdowns (active users only, minimal fields). */
export async function listAssignableUsers(org: string, roleNames?: string[]) {
  const conditions: SQL[] = [eq(users.organizationId, org), eq(users.isActive, true)];
  const rows = await db.query.users.findMany({
    where: and(...conditions),
    columns: { id: true, firstName: true, lastName: true, email: true },
    with: { role: { columns: { name: true } } },
    orderBy: asc(users.firstName),
  });
  return roleNames?.length ? rows.filter((u) => roleNames.includes(u.role.name)) : rows;
}
