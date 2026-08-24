import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { loginSchema, signupSchema } from "../schemas/auth.schema.js";

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Too many authentication attempts. Please try again later.",
    },
  },
});

const authRouter = Router();

authRouter.use(authRateLimiter);

authRouter.post(
  "/signup",
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

export { authRouter };
