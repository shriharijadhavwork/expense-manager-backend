import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import type { LoginInput, SignupInput } from "../schemas/auth.schema.js";
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
