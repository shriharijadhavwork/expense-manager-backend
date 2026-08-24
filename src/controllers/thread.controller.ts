import type { Request, Response } from "express";
import { threadService } from "../services/thread.service.js";
import type {
  CreateThreadInput,
  MarkThreadReadInput,
  ThreadIdParams,
  UpdateThreadInput,
} from "../schemas/thread.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

function requireUserId(req: Request): string {
  if (!req.user?.sub) {
    throw ApiError.unauthorized();
  }

  return req.user.sub;
}

export const threadController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const thread = await threadService.create(
      userId,
      req.body as CreateThreadInput,
    );

    res.status(201).json({
      success: true,
      data: thread,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const threads = await threadService.list(userId);

    res.status(200).json({
      success: true,
      data: threads,
    });
  }),

  listRecycleBin: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const threads = await threadService.listRecycleBin(userId);

    res.status(200).json({
      success: true,
      data: threads,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    const thread = await threadService.getById(userId, id);

    res.status(200).json({
      success: true,
      data: thread,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    const thread = await threadService.update(
      userId,
      id,
      req.body as UpdateThreadInput,
    );

    res.status(200).json({
      success: true,
      data: thread,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    await threadService.remove(userId, id);

    res.status(200).json({
      success: true,
      data: {
        message: "Thread moved to recycle bin",
      },
    });
  }),

  restore: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    const thread = await threadService.restore(userId, id);

    res.status(200).json({
      success: true,
      data: thread,
    });
  }),

  permanentlyDelete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    await threadService.permanentlyDelete(userId, id);

    res.status(200).json({
      success: true,
      data: {
        message: "Thread permanently deleted",
      },
    });
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ThreadIdParams;
    const thread = await threadService.markRead(
      userId,
      id,
      req.body as MarkThreadReadInput,
    );

    res.status(200).json({
      success: true,
      data: thread,
    });
  }),
};
