import express from 'express';
import { z } from 'zod';
import authService from '../services/authService';
import { validate } from '../middleware/validate';
import authenticate from '../middleware/authenticate';
import logger from '../utils/logger';

const router = express.Router();

// Login schema validation
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

// Refresh token schema validation
const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

/**
 * @route POST /auth/login
 * @desc Authenticate user and get tokens
 * @access Public
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    logger.info(`User logged in: ${email}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /auth/logout
 * @desc Logout user and invalidate tokens
 * @access Private
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await authService.logout(userId);
    
    logger.info(`User logged out: ${userId}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;