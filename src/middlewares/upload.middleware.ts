import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { MAX_ATTACHMENT_BYTES } from "../utils/attachment-policy.js";
import { ApiError } from "../utils/api-error.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_ATTACHMENT_BYTES,
  },
});

export const uploadSingleFile = upload.single("file");

export function handleUploadErrors(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      next(
        ApiError.badRequest("File is too large. Keep uploads under 8 MB."),
      );
      return;
    }

    next(ApiError.badRequest("Invalid upload request"));
    return;
  }

  next(err);
}
