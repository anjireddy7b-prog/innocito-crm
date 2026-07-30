import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '@/utils/ApiError';

type Target = 'body' | 'query' | 'params';

/** Validates & replaces req[target] with the parsed (and coerced) Zod result. */
export function validate(schema: AnyZodObject, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]);
      (req as any)[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.badRequest('Validation failed', err.flatten().fieldErrors));
      }
      next(err);
    }
  };
}
