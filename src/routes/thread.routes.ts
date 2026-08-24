import { Router } from "express";
import { threadController } from "../controllers/thread.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { messageRouter } from "./message.routes.js";
import {
  createThreadSchema,
  markThreadReadSchema,
  threadIdParamsSchema,
  updateThreadSchema,
} from "../schemas/thread.schema.js";

const threadRouter = Router();

threadRouter.use(authenticate);

threadRouter.use("/:id/messages", messageRouter);

threadRouter.post(
  "/",
  validateRequest(createThreadSchema),
  threadController.create,
);

threadRouter.get("/", threadController.list);

threadRouter.get("/recycle-bin", threadController.listRecycleBin);

threadRouter.get(
  "/:id",
  validateRequest(threadIdParamsSchema, "params"),
  threadController.getById,
);

threadRouter.patch(
  "/:id",
  validateRequest(threadIdParamsSchema, "params"),
  validateRequest(updateThreadSchema),
  threadController.update,
);

threadRouter.delete(
  "/:id",
  validateRequest(threadIdParamsSchema, "params"),
  threadController.remove,
);

threadRouter.post(
  "/:id/restore",
  validateRequest(threadIdParamsSchema, "params"),
  threadController.restore,
);

threadRouter.post(
  "/:id/read",
  validateRequest(threadIdParamsSchema, "params"),
  validateRequest(markThreadReadSchema),
  threadController.markRead,
);

threadRouter.delete(
  "/:id/permanent",
  validateRequest(threadIdParamsSchema, "params"),
  threadController.permanentlyDelete,
);

export { threadRouter };
