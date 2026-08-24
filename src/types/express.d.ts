import type { JwtPayload } from "./auth.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      validatedQuery?: unknown;
      validatedParams?: unknown;
      validatedBody?: unknown;
    }
  }
}

export {};
