import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import authService from '../services/authService';
import { validate } from '../middleware/validate';
import authenticate from '../middleware/authenticate';
import { prisma } from '../utils/database';
import logger from '../utils/logger';

const router = express.Router();

// Rate limiter : 10 tentatives/15min en production, 100 en développement
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

// Login schema validation
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

// Cookie options
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000,
  path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

/**
 * @route POST /auth/login
 * @desc Authenticate user and get tokens (set as httpOnly cookies)
 * @access Public (rate-limited)
 */
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Set httpOnly cookies
    res.cookie('access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    logger.info(`User logged in: ${email}`);

    // Renvoyer l'utilisateur ET le token (cookie httpOnly + fallback localStorage pour dev cross-port)
    return res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh access token using httpOnly cookie
 * @access Public (rate-limited)
 */
router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    const result = await authService.refreshToken(refreshToken);

    // Set new access_token cookie
    res.cookie('access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * @route GET /auth/me
 * @desc Return current authenticated user
 * @access Private
 */
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user });
});

/**
 * @route POST /auth/logout
 * @desc Logout user and invalidate tokens
 * @access Private
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    await authService.logout(userId);

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    logger.info(`User logged out: ${userId}`);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
