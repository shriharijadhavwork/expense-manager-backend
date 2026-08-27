import rateLimit from "express-rate-limit";

function jsonTooMany(message: string) {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  };
}

const skipInTest = () => process.env["NODE_ENV"] === "test";

/** Broad auth surface (login/signup/me). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: jsonTooMany(
    "Too many authentication attempts. Please try again later.",
  ),
});

/** Signup sends email — keep tighter than general auth. */
export const signupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: jsonTooMany(
    "Too many signup attempts. Please try again later.",
  ),
});

/** Email OTP verify/resend. */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: jsonTooMany(
    "Too many verification attempts. Please try again later.",
  ),
});

/** Forgot/reset password. */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: jsonTooMany(
    "Too many password reset attempts. Please try again later.",
  ),
});

/** Group invite create (sends email). */
export const inviteCreateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: jsonTooMany(
    "Too many invite requests. Please try again later.",
  ),
});
