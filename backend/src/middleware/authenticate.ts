import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import logger from '../utils/logger';
import { verifyAccessToken } from '../utils/sessionTokens';

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

export function requestAccessToken(req: Request): unknown {
  if (req.cookies?.access_token) return req.cookies.access_token;
  const bearer = /^Bearer (\S+)$/i.exec(req.get('Authorization') ?? '');
  return bearer?.[1];
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (authenticatedRequests.has(req)) return next();
    const token = requestAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      logger.warn('auth.access_token_refused');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { jwtVersion: true, isActive: true, role: true, tenantId: true, tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion || user.tenantId !== decoded.tenantId) {
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
  } catch {
    logger.error('auth.verification_unavailable');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default authenticate;
