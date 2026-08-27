import { Router } from "express";
import { groupInviteController } from "../controllers/group-invite.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { inviteTokenParamsSchema } from "../schemas/group-invite.schema.js";

const inviteRouter = Router();

inviteRouter.use(authenticate);

inviteRouter.post(
  "/:token/accept",
  validateRequest(inviteTokenParamsSchema, "params"),
  groupInviteController.accept,
);

export { inviteRouter };
