import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { JwtPayload } from "../types/auth.types.js";
import { ApiError } from "./api-error.js";

export function signAccessToken(userId: string): string {
  const payload: JwtPayload = { sub: userId };
  const expiresIn = env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>;
  const options: SignOptions = { expiresIn };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.sub !== "string" ||
      decoded.sub.length === 0
    ) {
      throw ApiError.unauthorized("Invalid token");
    }

    return { sub: decoded.sub };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.unauthorized("Invalid or expired token");
  }
}
