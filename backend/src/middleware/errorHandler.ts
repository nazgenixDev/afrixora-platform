import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import logger from '../utils/logger';

/**
 * Global error handler middleware
 * Handles different types of errors and returns appropriate responses
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error with details
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId,
  });

  // Handle Zod validation errors (400 Bad Request)
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.errors,
      code: 'VALIDATION_ERROR',
    });
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Handle unique constraint violations (409 Conflict)
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Resource already exists',
        details: `Unique constraint violation on: ${error.meta?.target}`,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
      });
    }

    // Handle foreign key constraint violations (400 Bad Request)
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Invalid reference',
        details: `Foreign key constraint violation`,
        code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
      });
    }

    // Handle record not found (404 Not Found)
    if (error.code === 'P2001' || error.code === 'P2018') {
      return res.status(404).json({
        error: 'Resource not found',
        code: 'RESOURCE_NOT_FOUND',
      });
    }

    // Other Prisma errors (500 Internal Server Error)
    return res.status(500).json({
      error: 'Database error',
      code: `PRISMA_${error.code}`,
    });
  }

  // Handle JWT errors (401 Unauthorized)
  if (error instanceof JsonWebTokenError || error instanceof TokenExpiredError) {
    return res.status(401).json({
      error: error instanceof TokenExpiredError ? 'Token expired' : 'Invalid token',
      code: error instanceof TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }

  // Handle custom errors with status code
  if ('statusCode' in error && typeof (error as any).statusCode === 'number') {
    const customError = error as any;
    return res.status(customError.statusCode).json({
      error: customError.message || 'Error occurred',
      code: customError.code || 'UNKNOWN_ERROR',
    });
  }

  // Default error handler (500 Internal Server Error)
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
};

export default errorHandler;