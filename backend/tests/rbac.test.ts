import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canAssignRole, canManageUser } from '../src/utils/rbac';

const roles = Object.values(Role);

describe.each([
  ['canAssignRole', canAssignRole],
  ['canManageUser', canManageUser],
] as const)('%s', (_name, check) => {
  it.each([
    [Role.SUPER_ADMIN, roles],
    [Role.TENANT_ADMIN, [Role.TENANT_ADMIN, Role.BUILDING_ADMIN, Role.OPERATOR, Role.VIEWER]],
    [Role.BUILDING_ADMIN, []],
    [Role.OPERATOR, []],
    [Role.VIEWER, []],
    ['UNKNOWN', []],
  ] as const)('applique les permissions de %s', (actor, allowedRoles) => {
    expect(roles.filter((target) => check(actor, target))).toEqual(allowedRoles);
  });
});
