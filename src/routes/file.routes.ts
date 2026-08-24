import { Router } from "express";
import { fileController } from "../controllers/file.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  handleUploadErrors,
  uploadSingleFile,
} from "../middlewares/upload.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { fileIdParamsSchema } from "../schemas/file.schema.js";

const fileRouter = Router();

fileRouter.use(authenticate);

fileRouter.post(
  "/upload",
  uploadSingleFile,
  handleUploadErrors,
  fileController.upload,
);

fileRouter.get(
  "/:id",
  validateRequest(fileIdParamsSchema, "params"),
  fileController.getById,
);

export { fileRouter };
