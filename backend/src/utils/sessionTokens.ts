import jwt from 'jsonwebtoken';
import { z } from 'zod';

const accessClaims = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  jwtVersion: z.number().int().nonnegative(),
  exp: z.number().int().optional(),
  purpose: z.literal('access').optional(),
});

export function verifyAccessToken(token: unknown) {
  const secret = process.env.JWT_SECRET;
  if (typeof token !== 'string' || !token || !secret) return null;
  try {
    return accessClaims.parse(jwt.verify(token, secret, { algorithms: ['HS256'] }));
  } catch {
    return null;
  }
}
