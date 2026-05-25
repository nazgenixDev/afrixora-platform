import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import logger from '../utils/logger';

/**
 * Authorization middleware factory
 * Creates a middleware that checks if the user has the required roles
 * @param allowedRoles Array of roles that are allowed to access the route
 * @returns Middleware function
 */
export const authorize = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user exists on request (set by authenticate middleware)
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user role is in allowed roles
      const userRole = req.user.role as Role;
      if (!allowedRoles.includes(userRole)) {
        logger.warn(`Authorization failed: User ${req.user.userId} with role ${userRole} attempted to access a restricted resource`);
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // User is authorized
      return next();
    } catch (error) {
      logger.error('Authorization error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Convenience exports for common role combinations
export const authorizeAdmin = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN]);
export const authorizeBuildingAdmin = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN]);
export const authorizeOperator = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN, Role.OPERATOR]);
export const authorizeAll = authorize([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.BUILDING_ADMIN, Role.OPERATOR, Role.VIEWER]);

export default authorize;