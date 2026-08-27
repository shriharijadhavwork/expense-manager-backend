import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  authRateLimiter,
  otpRateLimiter,
  passwordResetRateLimiter,
  signupRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "../schemas/auth.schema.js";
import { updateMeSchema } from "../schemas/user-preferences.schema.js";

const authRouter = Router();

authRouter.use(authRateLimiter);

authRouter.post(
  "/signup",
  signupRateLimiter,
  validateRequest(signupSchema),
  authController.signup,
);

authRouter.post(
  "/login",
  validateRequest(loginSchema),
  authController.login,
);

authRouter.post("/logout", authController.logout);

authRouter.get("/me", authenticate, authController.me);

authRouter.post(
  "/verify-email",
  authenticate,
  otpRateLimiter,
  validateRequest(verifyEmailSchema),
  authController.verifyEmail,
);

authRouter.post(
  "/resend-otp",
  authenticate,
  otpRateLimiter,
  authController.resendEmailOtp,
);

authRouter.post(
  "/forgot-password",
  passwordResetRateLimiter,
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword,
);

authRouter.post(
  "/reset-password",
  passwordResetRateLimiter,
  validateRequest(resetPasswordSchema),
  authController.resetPassword,
);

authRouter.patch(
  "/me",
  authenticate,
  validateRequest(updateMeSchema),
  authController.updateMe,
);

export { authRouter };
