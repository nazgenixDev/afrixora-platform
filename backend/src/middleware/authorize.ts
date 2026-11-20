import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

/**
 * Authorization middleware factory
 * Creates a middleware that checks if the user has the required roles
 * @param allowedRoles Array of roles that are allowed to access the route
 * @returns Middleware function
 */
export const authorize = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role as Role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
};

// Convenience exports for common role combinations
export const authorizeAdmin = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN]);
export const authorizeBuildingAdmin = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN]);
export const authorizeOperator = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN, Role.OPERATOR]);
export const authorizeAll = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN, Role.OPERATOR, Role.VIEWER]);

export default authorize;
