import type { NextFunction, Request, Response } from "express";
import { flattenError, type ZodType } from "zod";
import { ApiError } from "../utils/api-error.js";

type RequestTarget = "body" | "query" | "params";

export function validateRequest<T>(
  schema: ZodType<T>,
  target: RequestTarget = "body",
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(
        ApiError.badRequest("Invalid request", flattenError(result.error)),
      );
      return;
    }

    req[target] = result.data;
    next();
  };
}
