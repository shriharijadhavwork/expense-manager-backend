import type { Request, Response } from "express";
import { groupInviteService } from "../services/group-invite.service.js";
import type { CreateGroupInviteInput } from "../schemas/group-invite.schema.js";
import type { GroupIdParams } from "../schemas/group.schema.js";
import type {
  GroupInviteIdParams,
  InviteTokenParams,
} from "../schemas/group-invite.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

function requireUserId(req: Request): string {
  if (!req.user?.sub) {
    throw ApiError.unauthorized();
  }

  return req.user.sub;
}

function groupParams(req: Request): GroupIdParams {
  return (req.validatedParams ?? req.params) as GroupIdParams;
}

function inviteIdParams(req: Request): GroupInviteIdParams {
  return (req.validatedParams ?? req.params) as GroupInviteIdParams;
}

function tokenParams(req: Request): InviteTokenParams {
  return (req.validatedParams ?? req.params) as InviteTokenParams;
}

export const groupInviteController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const invite = await groupInviteService.create(
      userId,
      id,
      req.body as CreateGroupInviteInput,
    );

    res.status(201).json({
      success: true,
      data: invite,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const invites = await groupInviteService.listForGroup(userId, id);

    res.status(200).json({
      success: true,
      data: invites,
    });
  }),

  revoke: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id, inviteId } = inviteIdParams(req);
    const invite = await groupInviteService.revoke(userId, id, inviteId);

    res.status(200).json({
      success: true,
      data: invite,
    });
  }),

  accept: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { token } = tokenParams(req);
    const group = await groupInviteService.accept(userId, token);

    res.status(200).json({
      success: true,
      data: group,
    });
  }),
};
