import { describe, it, expect } from 'vitest';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, PERMISSIONS } from '@/utils/permissions';

describe('permission registry', () => {
  it('every permission referenced by a role exists in the master ALL_PERMISSIONS list', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(ALL_PERMISSIONS, `role ${role} references unknown permission ${perm}`).toContain(perm);
      }
    }
  });

  it('ADMIN role is granted every permission in the system', () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('only Admins hold the users:manage permission (no self-registration / privilege escalation)', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === 'ADMIN') continue;
      expect(perms, `role ${role} should not manage users`).not.toContain(PERMISSIONS.USERS_MANAGE);
    }
  });

  it('Inside Sales can create and assign leads; Sales/Delivery cannot create leads', () => {
    expect(ROLE_PERMISSIONS.INSIDE_SALES).toContain(PERMISSIONS.LEADS_CREATE);
    expect(ROLE_PERMISSIONS.INSIDE_SALES).toContain(PERMISSIONS.LEADS_ASSIGN);
    expect(ROLE_PERMISSIONS.SALES).not.toContain(PERMISSIONS.LEADS_CREATE);
    expect(ROLE_PERMISSIONS.DELIVERY).not.toContain(PERMISSIONS.LEADS_CREATE);
  });
});
