import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/database';
import { UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

const refreshPayloadSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  jwtVersion: z.number().int(),
});

class AuthService {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive) {
      logger.warn(`Login attempt failed for email: ${email}`);
      throw new UnauthorizedError();
    }

    // SUPER_ADMIN peut toujours se connecter, même si son tenant est désactivé
    if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
      logger.warn(`Tenant inactive for user: ${email}`);
      throw new UnauthorizedError();
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn(`Invalid password for user: ${email}`);
      throw new UnauthorizedError();
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

  async refreshToken(refreshToken: unknown): Promise<{ accessToken: string }> {
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedError();
    }

    let payload: unknown;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedError();
    }

    const decoded = refreshPayloadSchema.safeParse(payload);
    if (!decoded.success) {
      throw new UnauthorizedError();
    }

    const { userId, tenantId, jwtVersion } = decoded.data;
    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { id: true, tenantId: true, role: true, jwtVersion: true, isActive: true, tenant: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || user.jwtVersion !== jwtVersion ||
      (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive)) {
      throw new UnauthorizedError();
    }

    return { accessToken: this.generateAccessToken(user.id, user.tenantId, user.role, user.jwtVersion) };
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
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: 900 });
  }

  private generateRefreshToken(userId: string, tenantId: string, role: string, jwtVersion: number) {
    const payload: TokenPayload = { userId, tenantId, role, jwtVersion };
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: 604800 });
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

export default new AuthService();
