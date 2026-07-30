import { NextFunction, Request, Response } from 'express';
import { DatabaseError } from 'pg';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/config/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_NOT_NULL_VIOLATION = '23502';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof DatabaseError) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      statusCode = 409;
      message = `Duplicate value violates a unique constraint${err.detail ? `: ${err.detail}` : ''}`;
    } else if (err.code === PG_FOREIGN_KEY_VIOLATION) {
      statusCode = 409;
      message = 'Operation violates a foreign-key relationship';
    } else if (err.code === PG_NOT_NULL_VIOLATION) {
      statusCode = 400;
      message = `Missing required field: ${err.column ?? 'unknown'}`;
    } else {
      statusCode = 400;
      message = 'Database request error';
    }
  } else if (err instanceof Error) {
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, message);
  } else {
    logger.warn({ path: req.path, method: req.method, statusCode }, message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV !== 'production' && err instanceof Error ? { stack: err.stack } : {}),
  });
}
