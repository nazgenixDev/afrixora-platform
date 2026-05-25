import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// JWT token payload interface
interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

// Extend Express Request interface to include user property
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

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 * Attaches user data to request object
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'jwt-secret'
      ) as TokenPayload;

      // Check if user exists and jwtVersion matches
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { jwtVersion: true, isActive: true },
      });

      if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Attach user data to request
      req.user = {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role,
      };
      return next();

      next();
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