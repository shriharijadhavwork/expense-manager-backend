import type { Request, Response } from "express";
import { groupService } from "../services/group.service.js";
import type {
  AddGroupMemberInput,
  CreateGroupInput,
  CreateGroupThreadInput,
  GroupIdParams,
  GroupMemberParams,
  ResolveGroupInput,
  TransferGroupOwnershipInput,
  UpdateGroupInput,
} from "../schemas/group.schema.js";
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

function memberParams(req: Request): GroupMemberParams {
  return (req.validatedParams ?? req.params) as GroupMemberParams;
}

export const groupController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const group = await groupService.create(
      userId,
      req.body as CreateGroupInput,
    );

    res.status(201).json({
      success: true,
      data: group,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const groups = await groupService.list(userId);

    res.status(200).json({
      success: true,
      data: groups,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const group = await groupService.getById(userId, id);

    res.status(200).json({
      success: true,
      data: group,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const group = await groupService.update(
      userId,
      id,
      req.body as UpdateGroupInput,
    );

    res.status(200).json({
      success: true,
      data: group,
    });
  }),

  addMember: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const group = await groupService.addMember(
      userId,
      id,
      req.body as AddGroupMemberInput,
    );

    res.status(200).json({
      success: true,
      data: group,
    });
  }),

  removeMember: asyncHandler(async (req: Request, res: Response) => {
    const actorUserId = requireUserId(req);
    const { id, userId } = memberParams(req);
    const group = await groupService.removeMember(actorUserId, id, userId);

    res.status(200).json({
      success: true,
      data: group,
    });
  }),

  leave: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const result = await groupService.leave(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  transferOwnership: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const group = await groupService.transferOwnership(
      userId,
      id,
      req.body as TransferGroupOwnershipInput,
    );

    res.status(200).json({
      success: true,
      data: group,
    });
  }),

  resolve: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const result = await groupService.resolve(
      userId,
      req.body as ResolveGroupInput,
    );

    res.status(result.created ? 201 : 200).json({
      success: true,
      data: result,
    });
  }),

  createThread: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const thread = await groupService.createThread(
      userId,
      id,
      req.body as CreateGroupThreadInput,
    );

    res.status(201).json({
      success: true,
      data: thread,
    });
  }),

  listThreads: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = groupParams(req);
    const threads = await groupService.listThreads(userId, id);

    res.status(200).json({
      success: true,
      data: threads,
    });
  }),
};
