import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// JWT token payload interface
interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
}

class AuthService {
  /**
   * Authenticate a user with email and password
   * @param email User email
   * @param password User password
   * @returns Access token and refresh token
   */
  async login(email: string, password: string) {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      logger.warn(`Login attempt failed for email: ${email}`);
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn(`Invalid password for user: ${email}`);
      throw new Error('Invalid credentials');
    }

    // Generate tokens
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

  /**
   * Refresh an access token using a valid refresh token
   * @param refreshToken Refresh token
   * @returns New access token
   */
  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'refresh-secret'
      ) as TokenPayload;

      // Get user and check if jwtVersion matches
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion) {
        logger.warn(`Invalid refresh token for user: ${decoded.userId}`);
        throw new Error('Invalid refresh token');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(
        user.id,
        user.tenantId,
        user.role,
        user.jwtVersion
      );

      logger.info(`Access token refreshed for user: ${user.id}`);
      return { accessToken };
    } catch (error) {
      logger.error('Error refreshing token', { error });
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logout a user by incrementing their JWT version
   * @param userId User ID
   */
  async logout(userId: string) {
    // Increment jwtVersion to invalidate all existing tokens
    await prisma.user.update({
      where: { id: userId },
      data: { jwtVersion: { increment: 1 } },
    });

    logger.info(`User logged out: ${userId}`);
    return { success: true };
  }

  /**
   * Generate an access token
   * @param userId User ID
   * @param tenantId Tenant ID
   * @param role User role
   * @param jwtVersion JWT version
   * @returns Access token
   */
  private generateAccessToken(
    userId: string,
    tenantId: string,
    role: string,
    jwtVersion: number
  ) {
    const payload: TokenPayload = {
      userId,
      tenantId,
      role,
      jwtVersion,
    };

    return jwt.sign(payload, process.env.JWT_SECRET || 'jwt-secret', {
  expiresIn: 900, // 15 minutes en secondes
    });
  }

  /**
   * Generate a refresh token
   * @param userId User ID
   * @param tenantId Tenant ID
   * @param role User role
   * @param jwtVersion JWT version
   * @returns Refresh token
   */
  private generateRefreshToken(
    userId: string,
    tenantId: string,
    role: string,
    jwtVersion: number
  ) {
    const payload: TokenPayload = {
      userId,
      tenantId,
      role,
      jwtVersion,
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'refresh-secret', {
  expiresIn: 604800, // 7 jours en secondes
    });
  }

  /**
   * Hash a password
   * @param password Plain text password
   * @returns Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

export default new AuthService();