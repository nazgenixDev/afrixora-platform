import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import logger from '../utils/logger';

/**
 * Validation middleware factory
 * Creates a middleware that validates request data against a Zod schema
 * @param schema Zod schema to validate against
 * @returns Middleware function
 */
export const validate = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request data against schema
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
      
    } catch (error) {
      // Handle validation errors
      if (error instanceof ZodError) {
        logger.warn('Validation error', { 
          path: req.path, 
          errors: error.errors,
          userId: req.user?.userId 
        });
        
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }
      
      // Pass other errors to the global error handler
      next(error);
    }
  };
};

export default validate;