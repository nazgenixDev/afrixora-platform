import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database';
import logger from '../utils/logger';

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        role: string;
      };
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Lire le token depuis le cookie httpOnly (prioritaire) ou depuis l'header Authorization (fallback API key)
    let token: string | undefined;

    // 1. Essayer le cookie httpOnly
    if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    // 2. Fallback: header Authorization (pour les clients qui ne supportent pas les cookies)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { jwtVersion: true, isActive: true, role: true, tenantId: true, tenant: { select: { isActive: true } } },
      });

      if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // SUPER_ADMIN exempté de la vérification du tenant
      if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
        return res.status(401).json({ error: 'Tenant désactivé' });
      }

      const impersonatedTenantId = req.headers['x-tenant-id'] as string | undefined;
      if (user.role === 'SUPER_ADMIN' && impersonatedTenantId) {
        req.user = { userId: decoded.userId, tenantId: impersonatedTenantId, role: user.role };
      } else {
        req.user = { userId: decoded.userId, tenantId: user.tenantId, role: user.role };
      }

      return next();
    } catch (error) {
      logger.warn('JWT verification failed', { error });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    logger.error('Authentication error', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default authenticate;
