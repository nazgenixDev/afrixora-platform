import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const prisma = new PrismaClient();

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

class AuthService {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive) {
      logger.warn(`Login attempt failed for email: ${email}`);
      throw new Error('Invalid credentials');
    }

    // SUPER_ADMIN peut toujours se connecter, même si son tenant est désactivé
    if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
      logger.warn(`Tenant inactive for user: ${email}`);
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn(`Invalid password for user: ${email}`);
      throw new Error('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(user.id, user.tenantId, user.role, user.jwtVersion);
    const refreshToken = this.generateRefreshToken(user.id, user.tenantId, user.role, user.jwtVersion);

    logger.info(`User logged in: ${user.id}`);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production') as TokenPayload;
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { tenant: { select: { isActive: true } } },
      });
      if (!user || !user.isActive) {
        throw new Error('Invalid refresh token');
      }
      // SUPER_ADMIN exempté de la vérification du tenant
      if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
        throw new Error('Invalid refresh token');
      }
      if (user.jwtVersion !== decoded.jwtVersion) {
        throw new Error('Invalid refresh token');
      }
      const accessToken = this.generateAccessToken(user.id, user.tenantId, user.role, user.jwtVersion);
      return { accessToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { jwtVersion: { increment: 1 } },
    });
    return { success: true };
  }

  private generateAccessToken(userId: string, tenantId: string, role: string, jwtVersion: number) {
    const payload: TokenPayload = { userId, tenantId, role, jwtVersion };
    return jwt.sign(payload, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production', { expiresIn: 900 });
  }

  private generateRefreshToken(userId: string, tenantId: string, role: string, jwtVersion: number) {
    const payload: TokenPayload = { userId, tenantId, role, jwtVersion };
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production', { expiresIn: 604800 });
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

export default new AuthService();
