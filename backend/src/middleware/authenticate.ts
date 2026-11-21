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

// Certains routeurs appliquent le middleware de session à deux niveaux.
const authenticatedRequests = new WeakSet<Request>();

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: string;
      tenantId: string;
      role: string;
    };
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (authenticatedRequests.has(req)) return next();

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

    let decoded: TokenPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    } catch (error) {
      logger.warn('JWT verification failed', { error });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { jwtVersion: true, isActive: true, role: true, tenantId: true, tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
      return res.status(401).json({ error: 'Tenant désactivé' });
    }

    let tenantId = user.tenantId;
    const target = req.headers['x-tenant-id'];
    if (user.role === 'SUPER_ADMIN' && target !== undefined) {
      if (typeof target !== 'string' || !target.trim()) {
        return res.status(400).json({ error: 'Identifiant de tenant invalide' });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: target }, select: { id: true } });
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant cible introuvable', code: 'IMPERSONATED_TENANT_NOT_FOUND' });
      }
      tenantId = tenant.id;
      logger.info('Requête avec changement de tenant par un super administrateur', { userId: decoded.userId, tenantId });
    }

    req.user = { userId: decoded.userId, tenantId, role: user.role };
    authenticatedRequests.add(req);
    return next();
  } catch (error) {
    logger.error('Authentication error', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default authenticate;
