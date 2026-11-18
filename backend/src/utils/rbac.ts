import { Role } from "@prisma/client";

const tenantRoles: readonly Role[] = [
  Role.TENANT_ADMIN,
  Role.BUILDING_ADMIN,
  Role.OPERATOR,
  Role.VIEWER,
];

export function canAssignRole(actorRole: string, targetRole: Role): boolean {
  return actorRole === Role.SUPER_ADMIN ||
    (actorRole === Role.TENANT_ADMIN && tenantRoles.includes(targetRole));
}

export function canManageUser(actorRole: string, targetUserRole: Role): boolean {
  return canAssignRole(actorRole, targetUserRole);
}
