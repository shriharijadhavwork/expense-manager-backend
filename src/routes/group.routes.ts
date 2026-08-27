import { Router } from "express";
import { groupController } from "../controllers/group.controller.js";
import { groupInviteController } from "../controllers/group-invite.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  addGroupMemberSchema,
  createGroupSchema,
  createGroupThreadSchema,
  groupIdParamsSchema,
  groupMemberParamsSchema,
  resolveGroupSchema,
  transferGroupOwnershipSchema,
  updateGroupSchema,
} from "../schemas/group.schema.js";
import {
  createGroupInviteSchema,
  groupInviteIdParamsSchema,
} from "../schemas/group-invite.schema.js";

const groupRouter = Router();

groupRouter.use(authenticate);

groupRouter.post(
  "/",
  validateRequest(createGroupSchema),
  groupController.create,
);

groupRouter.post(
  "/resolve",
  validateRequest(resolveGroupSchema),
  groupController.resolve,
);

groupRouter.get("/", groupController.list);

groupRouter.get(
  "/:id",
  validateRequest(groupIdParamsSchema, "params"),
  groupController.getById,
);

groupRouter.patch(
  "/:id",
  validateRequest(groupIdParamsSchema, "params"),
  validateRequest(updateGroupSchema),
  groupController.update,
);

groupRouter.post(
  "/:id/members",
  validateRequest(groupIdParamsSchema, "params"),
  validateRequest(addGroupMemberSchema),
  groupController.addMember,
);

groupRouter.delete(
  "/:id/members/:userId",
  validateRequest(groupMemberParamsSchema, "params"),
  groupController.removeMember,
);

groupRouter.post(
  "/:id/leave",
  validateRequest(groupIdParamsSchema, "params"),
  groupController.leave,
);

groupRouter.post(
  "/:id/transfer",
  validateRequest(groupIdParamsSchema, "params"),
  validateRequest(transferGroupOwnershipSchema),
  groupController.transferOwnership,
);

groupRouter.post(
  "/:id/invites",
  validateRequest(groupIdParamsSchema, "params"),
  validateRequest(createGroupInviteSchema),
  groupInviteController.create,
);

groupRouter.get(
  "/:id/invites",
  validateRequest(groupIdParamsSchema, "params"),
  groupInviteController.list,
);

groupRouter.delete(
  "/:id/invites/:inviteId",
  validateRequest(groupInviteIdParamsSchema, "params"),
  groupInviteController.revoke,
);

groupRouter.post(
  "/:id/threads",
  validateRequest(groupIdParamsSchema, "params"),
  validateRequest(createGroupThreadSchema),
  groupController.createThread,
);

groupRouter.get(
  "/:id/threads",
  validateRequest(groupIdParamsSchema, "params"),
  groupController.listThreads,
);

export { groupRouter };
