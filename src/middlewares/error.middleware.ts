import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

type ErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(ApiError.notFound("Route not found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err.details !== undefined) {
      body.error.details = err.details;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  if (env.NODE_ENV !== "production") {
    console.error(err);
  } else {
    console.error("Unhandled error");
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  } satisfies ErrorBody);
}
