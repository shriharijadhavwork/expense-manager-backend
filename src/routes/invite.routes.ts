import { Router } from "express";
import { groupInviteController } from "../controllers/group-invite.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { inviteCreateRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  createDirectInviteSchema,
  inviteTokenParamsSchema,
} from "../schemas/group-invite.schema.js";

const inviteRouter = Router();

inviteRouter.post(
  "/direct",
  authenticate,
  inviteCreateRateLimiter,
  validateRequest(createDirectInviteSchema),
  groupInviteController.createDirect,
);

inviteRouter.get(
  "/:token",
  validateRequest(inviteTokenParamsSchema, "params"),
  groupInviteController.preview,
);

inviteRouter.post(
  "/:token/accept",
  authenticate,
  validateRequest(inviteTokenParamsSchema, "params"),
  groupInviteController.accept,
);

export { inviteRouter };
