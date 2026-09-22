import argon2 from 'argon2';
import { Request } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/config/db';
import { organizations, users, refreshTokens, rolePermissions } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { signAccessToken, generateRefreshTokenValue, hashToken, refreshExpiryDate } from '@/utils/tokens';
import { seedDefaultRolesForOrganization } from '@/utils/defaultRoles';

/** Slugify an organization name into the same shape `slugSchema` in organizations.validation.ts
 * accepts: lowercase letters/digits separated by single hyphens, no leading/trailing hyphen. */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'org';
}

/**
 * Finds a slug that doesn't collide with an existing organization. When the caller explicitly
 * chose a slug (signup's optional `slug` field), a collision is a real conflict they need to
 * resolve themselves — auto-renaming it out from under them would be surprising. When the slug
 * was auto-derived from the organization name (the common case), silently appending a numeric
 * suffix is the better UX: nobody types their org name expecting to negotiate a URL.
 */
async function resolveUniqueSlug(candidate: string, explicit: boolean): Promise<string> {
  const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, candidate) });
  if (!existing) return candidate;
  if (explicit) throw ApiError.conflict('That organization URL is already taken — please choose another.');

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const attempt = `${candidate}-${suffix}`;
    const clash = await db.query.organizations.findFirst({ where: eq(organizations.slug, attempt) });
    if (!clash) return attempt;
  }
  // Astronomically unlikely (1000 organizations sharing the exact same derived name), but fail
  // loudly rather than looping forever.
  throw ApiError.conflict('Could not generate a unique organization URL — please choose one explicitly.');
}

/**
 * Self-service organization signup (Phase 2). Creates a brand-new tenant plus its first user as
 * that tenant's ADMIN, then returns the same session shape auth.service.ts's login() does (access
 * token + refresh token + safe user), so the frontend can treat a successful signup exactly like a
 * successful login — no separate "now go sign in" step. Deliberately does NOT touch anything
 * belonging to an existing organization: this only ever inserts one new organizations row and one
 * new users row scoped to it, so it can never affect another tenant's data or isolation guarantees
 * (the same tenant-isolation invariant Phase 1 proved end-to-end in tenantIsolation.test.ts).
 */
export async function signup(
  req: Request,
  input: { organizationName: string; slug?: string; firstName: string; lastName: string; email: string; password: string }
) {
  const email = input.email.toLowerCase();

  // users.email is a platform-wide unique constraint (a deliberate Phase 1 decision kept as-is in
  // Phase 2 — see users.service.ts's createUser for the same note): one email is one person, one
  // account, one organization. This keeps the existing single-field login form correct without
  // needing an org-picker step, at the cost of a person not being able to belong to more than one
  // organization under the same email — an acceptable tradeoff for this product today.
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingUser) throw ApiError.conflict('A user with this email already exists');

  const candidateSlug = input.slug ?? generateSlug(input.organizationName);
  const slug = await resolveUniqueSlug(candidateSlug, Boolean(input.slug));

  const [organization] = await db.insert(organizations).values({ name: input.organizationName, slug }).returning();

  // Phase 3: every organization gets its OWN copy of the 5 default roles (never a shared global
  // row — see utils/defaultRoles.ts and migrations 0011-0013) so this org's role permissions can
  // never be edited out from under it, or edit anyone else's, by construction. This is the direct
  // replacement for the old `eq(roles.name, 'ADMIN')` lookup, which — before Phase 3 — pointed
  // every organization's first Admin at the exact same platform-wide row.
  const roleByName = await seedDefaultRolesForOrganization(organization.id);
  const adminRole = roleByName.get('ADMIN');
  if (!adminRole) throw ApiError.internal('ADMIN role could not be seeded — cannot provision a new organization');
  // ROLE_PERMISSIONS['ADMIN'] is ALL_PERMISSIONS today, but read the grants seedDefaultRolesForOrganization
  // actually created rather than assuming that, so this stays correct even after an Admin edits the
  // ADMIN role's grants for their own organization later.
  const adminPermissionRows = await db.query.rolePermissions.findMany({
    where: eq(rolePermissions.roleId, adminRole.id),
    with: { permission: true },
  });
  const adminPermissions = adminPermissionRows.map((rp) => rp.permission.key);

  const passwordHash = await argon2.hash(input.password);
  const [user] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: adminRole.id,
      isActive: true,
      // Unlike an Admin-created teammate (users.service.ts's createUser, which issues a temporary
      // password the person didn't choose), a signup submitter picked their own password, so
      // there is nothing to force a change of.
      mustChangePassword: false,
    })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'Organization', entityId: organization.id, newValues: organization, organizationId: organization.id });
  await recordAudit({ req, action: 'CREATE', entityType: 'User', entityId: user.id, newValues: { email: user.email, firstName: user.firstName, lastName: user.lastName }, organizationId: organization.id });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: adminRole.name,
    permissions: adminPermissions,
    organizationId: organization.id,
  });

  const refreshValue = generateRefreshTokenValue();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshValue),
    expiresAt: refreshExpiryDate(),
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  await recordAudit({ req, action: 'LOGIN', entityType: 'User', entityId: user.id, organizationId: organization.id });

  const { passwordHash: _omit, ...safeUser } = user;
  return {
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    accessToken,
    refreshToken: refreshValue,
    user: { ...safeUser, permissions: adminPermissions, role: adminRole.name },
  };
}

export async function getMyOrganization(req: Request) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId(req)) });
  if (!org) throw ApiError.notFound('Organization not found');
  return org;
}

export async function updateMyOrganization(req: Request, input: { name?: string; slug?: string }) {
  const org = orgId(req);
  const existing = await db.query.organizations.findFirst({ where: eq(organizations.id, org) });
  if (!existing) throw ApiError.notFound('Organization not found');

  if (input.slug && input.slug !== existing.slug) {
    const clash = await db.query.organizations.findFirst({ where: and(eq(organizations.slug, input.slug), ne(organizations.id, org)) });
    if (clash) throw ApiError.conflict('That organization URL is already taken — please choose another.');
  }

  const [updated] = await db
    .update(organizations)
    .set({
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org))
    .returning();

  await recordAudit({ req, action: 'UPDATE', entityType: 'Organization', entityId: org, oldValues: { name: existing.name, slug: existing.slug }, newValues: { name: updated.name, slug: updated.slug } });

  return updated;
}
