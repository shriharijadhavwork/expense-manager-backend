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

    // Express 5 exposes read-only getters for `query` (and sometimes `params`).
    // Always keep a typed copy on the request; mutate only when writable.
    if (target === "body") {
      req.validatedBody = result.data;
      req.body = result.data;
    } else if (target === "query") {
      req.validatedQuery = result.data;
    } else {
      req.validatedParams = result.data;
      try {
        Object.assign(req.params, result.data as Record<string, string>);
      } catch {
        // Params may be read-only; controllers can use validatedParams.
      }
    }

    next();
  };
}
