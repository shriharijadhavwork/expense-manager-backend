import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from "../schemas/auth.schema.js";
import type { UpdateMeInput } from "../schemas/user-preferences.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const authController = {
  signup: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.signup(req.body as SignupInput);

    res.status(201).json({
      success: true,
      data: result,
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginInput);

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  logout: asyncHandler(async (_req: Request, res: Response) => {
    const result = authService.logout();

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }

    const user = await authService.getMe(req.user.sub);

    res.status(200).json({
      success: true,
      data: user,
    });
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }

    const user = await authService.verifyEmail(
      req.user.sub,
      req.body as VerifyEmailInput,
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  }),

  resendEmailOtp: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }

    const result = await authService.resendEmailOtp(req.user.sub);

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(
      req.body as ForgotPasswordInput,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.resetPassword(
      req.body as ResetPasswordInput,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }

    const preferences = await authService.updateMe(
      req.user.sub,
      req.body as UpdateMeInput,
    );

    res.status(200).json({
      success: true,
      data: preferences,
    });
  }),
};
