import { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

/**
 * Validation middleware factory
 * Creates a middleware that validates request data against a Zod schema
 * @param schema Zod schema to validate against
 * @returns Middleware function
 */
export const validate = (schema: ZodType<{ body?: unknown; query?: unknown; params?: unknown }>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request data against schema
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body !== undefined) res.locals.validatedBody = parsed.body;
      if (parsed.query !== undefined) res.locals.validatedQuery = parsed.query;
      return next();
      
    } catch (error) {
      next(error);
    }
  };
};

export default validate;
