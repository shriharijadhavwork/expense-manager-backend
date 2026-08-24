import type { Request, Response } from "express";
import { fileService } from "../services/file.service.js";
import type { FileIdParams } from "../schemas/file.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

function requireUserId(req: Request): string {
  if (!req.user?.sub) {
    throw ApiError.unauthorized();
  }

  return req.user.sub;
}

function getFileId(req: Request): string {
  const params =
    (req.validatedParams as FileIdParams | undefined) ??
    (req.params as FileIdParams);
  return params.id;
}

export const fileController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    if (!req.file) {
      throw ApiError.badRequest("No file uploaded");
    }

    const file = await fileService.upload(userId, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    res.status(201).json({
      success: true,
      data: file,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const fileId = getFileId(req);
    const file = await fileService.getById(userId, fileId);

    res.status(200).json({
      success: true,
      data: file,
    });
  }),
};
