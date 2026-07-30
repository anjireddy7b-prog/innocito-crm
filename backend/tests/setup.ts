import { beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/config/db';
import { roles, permissions, rolePermissions, users } from '@/db/schema';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '@/utils/permissions';
import { eq } from 'drizzle-orm';

export const TEST_ADMIN = { email: 'admin@innocito.com', password: 'ChangeMe!123' };
export const TEST_INSIDE_SALES = { email: 'inside.sales@innocito.com', password: 'Welcome@123' };
export const TEST_SALES = { email: 'sales@innocito.com', password: 'Welcome@123' };

async function seedMinimal() {
  const permissionRows = await Promise.all(
    ALL_PERMISSIONS.map(async (key) => {
      const [row] = await db.insert(permissions).values({ key }).returning();
      return row;
    })
  );
  const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));

  const roleIds: Record<string, string> = {};
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    const [role] = await db.insert(roles).values({ name: roleName as any }).returning();
    roleIds[roleName] = role.id;
    const grants = ROLE_PERMISSIONS[roleName as keyof typeof ROLE_PERMISSIONS]
      .map((key) => permissionByKey.get(key))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (grants.length) {
      await db.insert(rolePermissions).values(grants.map((p) => ({ roleId: role.id, permissionId: p.id })));
    }
  }

  await db.insert(users).values({
    email: TEST_ADMIN.email,
    firstName: 'Test',
    lastName: 'Admin',
    roleId: roleIds.ADMIN,
    passwordHash: await argon2.hash(TEST_ADMIN.password),
    mustChangePassword: false,
    isActive: true,
  });

  await db.insert(users).values({
    email: TEST_INSIDE_SALES.email,
    firstName: 'Test',
    lastName: 'InsideSales',
    roleId: roleIds.INSIDE_SALES,
    passwordHash: await argon2.hash(TEST_INSIDE_SALES.password),
    mustChangePassword: false,
    isActive: true,
  });

  await db.insert(users).values({
    email: TEST_SALES.email,
    firstName: 'Test',
    lastName: 'Sales',
    roleId: roleIds.SALES,
    passwordHash: await argon2.hash(TEST_SALES.password),
    mustChangePassword: false,
    isActive: true,
  });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  // Clean slate in case a previous run left data behind (test DB is dedicated, safe to truncate)
  const tableNames = [
    'audit_logs', 'notifications', 'activities', 'comments', 'documents', 'tasks', 'meetings',
    'leads', 'campaigns', 'contacts', 'companies', 'refresh_tokens', 'users', 'role_permissions',
    'permissions', 'roles',
  ];
  await pool.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
  await seedMinimal();
}, 30000);

afterAll(async () => {
  await pool.end();
});
