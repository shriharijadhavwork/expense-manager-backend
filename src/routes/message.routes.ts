import { Router } from "express";
import { messageController } from "../controllers/message.controller.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  createMessageSchema,
  listMessagesQuerySchema,
  threadIdParamsSchema,
} from "../schemas/message.schema.js";

const messageRouter = Router({ mergeParams: true });

messageRouter.get(
  "/",
  validateRequest(threadIdParamsSchema, "params"),
  validateRequest(listMessagesQuerySchema, "query"),
  messageController.list,
);

messageRouter.post(
  "/",
  validateRequest(threadIdParamsSchema, "params"),
  validateRequest(createMessageSchema),
  messageController.create,
);

export { messageRouter };
