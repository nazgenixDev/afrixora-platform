import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',').map(origin => origin.trim()).filter(Boolean);
}

// Les mutations sous session cookie exigent une origine autorisée.
export function enforceOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  const hasSessionCookie = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
  if ((origin && !allowedOrigins().includes(origin)) || (hasSessionCookie && !origin)) {
    res.status(403).json({ error: 'Origine de la requête refusée', code: 'ORIGIN_DENIED' });
    return;
  }
  next();
}
