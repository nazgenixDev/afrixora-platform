import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { prisma } from '../utils/database';
import { verifyAccessToken } from '../utils/sessionTokens';
import logger from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';
import { rotateRefreshSession, startRefreshSession } from './refreshSessions';

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

const refreshPayloadSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  jwtVersion: z.number().int().nonnegative(),
  exp: z.number().int(),
  sessionId: z.string().uuid(),
  jti: z.string().uuid(),
  purpose: z.literal('refresh'),
});

export const accessLifetime = 15 * 60;
const refreshLifetime = 7 * 24 * 60 * 60;
export const sessionEvents = new EventEmitter();

class AuthService {
  private async authenticateUser(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive) {
      logger.warn('auth.login_refused', { reason: 'account_unavailable' });
      throw new UnauthorizedError();
    }

    // SUPER_ADMIN peut toujours se connecter, même si son tenant est désactivé
    if (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive) {
      logger.warn('auth.login_refused', { reason: 'tenant_inactive', userId: user.id });
      throw new UnauthorizedError();
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn('auth.login_refused', { reason: 'invalid_password', userId: user.id });
      throw new UnauthorizedError();
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.authenticateUser(email, password);
    const accessToken = this.generateAccessToken(user);
    const expiresAt = Math.floor(Date.now() / 1000) + refreshLifetime;
    const sessionId = randomUUID();
    const refreshToken = this.generateRefreshToken(user, sessionId, expiresAt);
    await startRefreshSession(sessionId, refreshToken, expiresAt);
    logger.info('auth.browser_session_opened', { userId: user.id });
    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async issueAccessToken(email: string, password: string) {
    const user = await this.authenticateUser(email, password);
    const accessToken = this.generateAccessToken(user);
    logger.info('auth.client_token_issued', { userId: user.id });
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId } };
  }

  private verifyRefreshToken(token: string) {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) return null;
    try {
      return refreshPayloadSchema.parse(jwt.verify(token, secret, { algorithms: ['HS256'] }));
    } catch {
      return null;
    }
  }

  async refreshToken(refreshToken: unknown) {
    if (typeof refreshToken !== 'string') throw new UnauthorizedError();
    const session = this.verifyRefreshToken(refreshToken);
    if (!session) throw new UnauthorizedError();

    const { userId, tenantId, jwtVersion, sessionId, exp } = session;
    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { id: true, tenantId: true, role: true, jwtVersion: true, isActive: true, tenant: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || user.jwtVersion !== jwtVersion ||
      (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive)) {
      throw new UnauthorizedError();
    }

    const replacement = this.generateRefreshToken(user, sessionId, exp);
    const result = await rotateRefreshSession(sessionId, refreshToken, replacement);
    if (result === 'replayed') {
      logger.warn('auth.refresh_replayed', { userId });
      await this.revokeUserSessions(userId, jwtVersion);
    }
    if (result !== 'rotated') throw new UnauthorizedError();
    return { accessToken: this.generateAccessToken(user, exp), refreshToken: replacement, expiresAt: exp };
  }

  async logout(accessToken: unknown, refreshToken: unknown) {
    const access = verifyAccessToken(accessToken);
    if (access && await this.revokeUserSessions(access.userId, access.jwtVersion)) return;

    const refresh = typeof refreshToken === 'string' ? this.verifyRefreshToken(refreshToken) : null;
    if (refresh && (refresh.userId !== access?.userId || refresh.jwtVersion !== access?.jwtVersion)) {
      await this.revokeUserSessions(refresh.userId, refresh.jwtVersion);
    }
  }

  private async revokeUserSessions(userId: string, jwtVersion: number) {
    const result = await prisma.user.updateMany({
      where: { id: userId, jwtVersion },
      data: { jwtVersion: { increment: 1 } },
    });
    if (result.count === 0) return false;
    logger.info('auth.sessions_revoked', { userId });
    sessionEvents.emit('revoked', userId, jwtVersion);
    return true;
  }

  private generateAccessToken(
    user: { id: string; tenantId: string; role: string; jwtVersion: number },
    sessionExpiresAt = Infinity,
  ) {
    const payload: TokenPayload = { userId: user.id, tenantId: user.tenantId, role: user.role, jwtVersion: user.jwtVersion };
    const exp = Math.min(sessionExpiresAt, Math.floor(Date.now() / 1000) + accessLifetime);
    return jwt.sign({ ...payload, purpose: 'access', exp }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
  }

  private generateRefreshToken(user: { id: string; tenantId: string; jwtVersion: number }, sessionId: string, expiresAt: number) {
    const payload = {
      userId: user.id,
      tenantId: user.tenantId,
      jwtVersion: user.jwtVersion,
      sessionId,
      exp: expiresAt,
      purpose: 'refresh',
    };
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { algorithm: 'HS256', jwtid: randomUUID() });
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

export default new AuthService();
