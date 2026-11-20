import express, { type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import authService, { accessLifetime } from '../services/authService';
import { validate } from '../middleware/validate';
import authenticate, { requestAccessToken } from '../middleware/authenticate';
import { prisma } from '../utils/database';
import { configuredBrowserOrigins } from '../utils/browserOrigins';

const router = express.Router();

// Rate limiter : 10 tentatives/15min en production, 100 en développement
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    // La limite JSON borne la taille tout en acceptant les anciens mots de passe.
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const accessCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const refreshCookie = {
  ...accessCookie,
  path: '/api/v1/auth',
};

function setSessionCookies(
  res: Response,
  session: { accessToken: string; refreshToken: string; expiresAt: number },
) {
  const maxAge = Math.max(0, Math.min(accessLifetime * 1000, session.expiresAt * 1000 - Date.now()));
  res.cookie('access_token', session.accessToken, { ...accessCookie, maxAge });
  res.cookie('refresh_token', session.refreshToken, {
    ...refreshCookie,
    expires: new Date(session.expiresAt * 1000),
  });
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  if (!configuredBrowserOrigins().includes(req.get('Origin') ?? '')) {
    return res.status(403).json({ error: 'Origine du navigateur refusée', code: 'ORIGIN_FORBIDDEN' });
  }
  try {
    const { email, password }: z.infer<typeof loginSchema>['body'] = res.locals.validatedBody;
    const result = await authService.login(email, password);
    res.clearCookie('refresh_token', accessCookie);
    setSessionCookies(res, result);
    return res.json({ user: result.user });
  } catch (error) {
    return next(error);
  }
});

// Les clients en ligne de commande obtiennent un jeton sans établir de session navigateur.
router.post('/token', loginLimiter, validate(loginSchema), async (req, res, next) => {
  if (req.get('Origin') !== undefined || req.get('Sec-Fetch-Site') !== undefined ||
      req.cookies?.access_token || req.cookies?.refresh_token) {
    return res.status(403).json({ error: 'Route réservée aux clients hors navigateur', code: 'BEARER_CLIENT_REQUIRED' });
  }
  try {
    const { email, password }: z.infer<typeof loginSchema>['body'] = res.locals.validatedBody;
    return res.json(await authService.issueAccessToken(email, password));
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const result = await authService.refreshToken(req.cookies?.refresh_token);
    setSessionCookies(res, result);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await authService.logout(requestAccessToken(req), req.cookies?.refresh_token);
    res.clearCookie('access_token', accessCookie);
    res.clearCookie('refresh_token', refreshCookie);
    res.clearCookie('refresh_token', accessCookie);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
