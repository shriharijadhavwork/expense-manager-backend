import {
  messageRepository,
  type CreateMessageRecord,
  type ListMessagesOptions,
} from "../repositories/message.repository.js";
import { threadRepository } from "../repositories/thread.repository.js";
import { fileService } from "./file.service.js";
import { threadService } from "./thread.service.js";
import type { MessageDocument } from "../models/message.model.js";
import type {
  CreateMessageInput,
  ListMessagesQuery,
} from "../schemas/message.schema.js";
import { publishMessageCreated } from "../realtime/publish-message-created.js";
import { aiDebounceService } from "../ai/services/debounce.service.js";
import { ApiError } from "../utils/api-error.js";
import { assertThreadAcceptsUserMessage } from "../utils/thread-message-window.js";

export type SafeMessage = {
  id: string;
  threadId: string;
  userId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachmentIds: string[];
  expenseIds: string[];
  createdAt: string;
};

export type MessageListResult = {
  items: SafeMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function toSafeMessage(message: MessageDocument): SafeMessage {
  return {
    id: String(message._id),
    threadId: String(message.threadId),
    userId: String(message.userId),
    role: message.role,
    content: message.content,
    attachmentIds: message.attachmentIds.map((id) => String(id)),
    expenseIds: message.expenseIds.map((id) => String(id)),
    createdAt: message.createdAt.toISOString(),
  };
}

/** Used by group system messages to publish after persist. */
export function safeMessageFromDocument(message: MessageDocument): SafeMessage {
  return toSafeMessage(message);
}

function resolveLimit(query: ListMessagesQuery): number {
  const limit = query.limit ?? DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export const messageService = {
  async list(
    userId: string,
    threadId: string,
    query: ListMessagesQuery = {},
  ): Promise<MessageListResult> {
    const thread = await threadService.requireAccessibleThread(
      userId,
      threadId,
      { includeDeleted: true },
    );

    const limit = resolveLimit(query);

    if (query.before) {
      const cursor =
        thread.type === "personal"
          ? await messageRepository.findByIdForThread(
              query.before,
              threadId,
              userId,
            )
          : await messageRepository.findByIdInThread(query.before, threadId);

      if (!cursor) {
        throw ApiError.badRequest("Invalid cursor");
      }
    }

    const listOptions: ListMessagesOptions = { limit };
    if (query.before) {
      listOptions.before = query.before;
    }

    const messages =
      thread.type === "personal"
        ? await messageRepository.listByThread(threadId, userId, listOptions)
        : await messageRepository.listAllByThread(threadId, listOptions);

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const chronological = [...page].reverse();
    const nextCursor =
      hasMore && page.length > 0 ? String(page[page.length - 1]!._id) : null;

    return {
      items: chronological.map(toSafeMessage),
      hasMore,
      nextCursor,
    };
  },

  async create(
    userId: string,
    threadId: string,
    input: CreateMessageInput,
  ): Promise<SafeMessage> {
    const thread = await threadService.requireAccessibleThread(
      userId,
      threadId,
      { includeDeleted: true },
    );

    if (thread.deletedAt) {
      throw ApiError.badRequest("In Recycle Bin — restore to continue");
    }

    assertThreadAcceptsUserMessage(thread);

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await fileService.assertOwnedFileIds(userId, input.attachmentIds);
    }

    const now = new Date();
    const createInput: CreateMessageRecord = {
      threadId,
      userId,
      role: "user",
      content: input.content,
    };

    if (input.attachmentIds) {
      createInput.attachmentIds = input.attachmentIds;
    }

    const message = await messageRepository.create(createInput);

    await threadRepository.incrementMessageCounts(threadId, {
      userMessageCount: 1,
    });

    if (thread.type === "personal") {
      await threadRepository.updateByIdForUser(threadId, userId, {
        lastActivityAt: now,
      });
    } else {
      await threadRepository.updateById(threadId, {
        lastActivityAt: now,
      });
    }

    const safe = toSafeMessage(message);
    await publishMessageCreated(safe);

    aiDebounceService.scheduleUserMessage({
      threadId,
      userId,
      messageId: safe.id,
      content: safe.content,
    });

    return safe;
  },

  async createAssistant(
    userId: string,
    threadId: string,
    content: string,
    expenseIds?: string[],
  ): Promise<SafeMessage> {
    const thread = await threadService.requireAccessibleThread(
      userId,
      threadId,
      { includeDeleted: true },
    );

    if (thread.deletedAt) {
      throw ApiError.badRequest("In Recycle Bin — restore to continue");
    }

    const now = new Date();
    const message = await messageRepository.create({
      threadId,
      userId,
      role: "assistant",
      content,
    });

    if (expenseIds && expenseIds.length > 0) {
      for (const expenseId of expenseIds) {
        await messageRepository.addExpenseId(
          String(message._id),
          threadId,
          userId,
          expenseId,
        );
      }
    }

    await threadRepository.incrementMessageCounts(threadId, {
      assistantMessageCount: 1,
    });

    if (thread.type === "personal") {
      await threadRepository.updateByIdForUser(threadId, userId, {
        lastActivityAt: now,
      });
    } else {
      await threadRepository.updateById(threadId, {
        lastActivityAt: now,
      });
    }

    const refreshed =
      expenseIds && expenseIds.length > 0
        ? await messageRepository.findByIdInThread(
            String(message._id),
            threadId,
          )
        : message;

    const safe = toSafeMessage(refreshed ?? message);
    await publishMessageCreated(safe);
    return safe;
  },
};
