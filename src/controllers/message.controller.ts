import type { Request, Response } from "express";
import { messageService } from "../services/message.service.js";
import type {
  CreateMessageInput,
  ListMessagesQuery,
  ThreadIdParams,
} from "../schemas/message.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

function requireUserId(req: Request): string {
  if (!req.user?.sub) {
    throw ApiError.unauthorized();
  }

  return req.user.sub;
}

function getThreadId(req: Request): string {
  const params =
    (req.validatedParams as ThreadIdParams | undefined) ??
    (req.params as ThreadIdParams);
  return params.id;
}

export const messageController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const threadId = getThreadId(req);
    const query =
      (req.validatedQuery as ListMessagesQuery | undefined) ??
      (req.query as ListMessagesQuery);
    const result = await messageService.list(userId, threadId, query);

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const threadId = getThreadId(req);
    const message = await messageService.create(
      userId,
      threadId,
      req.body as CreateMessageInput,
    );

    res.status(201).json({
      success: true,
      data: message,
    });
  }),
};
