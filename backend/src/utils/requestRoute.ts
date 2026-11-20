import type { Request } from 'express';

export function routePath(req: Request): string {
  const route: unknown = req.route?.path;
  return typeof route === 'string' ? req.baseUrl + route : req.baseUrl || '/';
}
