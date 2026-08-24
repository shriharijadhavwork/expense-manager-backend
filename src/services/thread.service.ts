import mongoose from "mongoose";
import { threadRepository } from "../repositories/thread.repository.js";
import type { ThreadDocument } from "../models/thread.model.js";
import type {
  CreateThreadInput,
  MarkThreadReadInput,
  UpdateThreadInput,
} from "../schemas/thread.schema.js";
import { ApiError } from "../utils/api-error.js";

export type SafeThreadLastMessage = {
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt: string;
  hasAttachments: boolean;
};

export type SafeThread = {
  id: string;
  userId: string;
  title: string;
  lastActivityAt: string;
  readAt: string | null;
  unread: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: SafeThreadLastMessage | null;
};

const DEFAULT_TITLE = "New conversation";

function computeUnread(lastActivityAt: Date, readAt: Date | null | undefined): boolean {
  if (!readAt) {
    return true;
  }

  return lastActivityAt.getTime() > readAt.getTime();
}

function toReadAtIso(readAt: Date | null | undefined): string | null {
  return readAt ? readAt.toISOString() : null;
}

function toSafeThreadLastMessage(
  message: {
    content: string;
    role: "user" | "assistant" | "system" | "tool";
    createdAt: Date;
    attachmentIds: { length: number };
  } | null
  | undefined,
): SafeThreadLastMessage | null {
  if (!message) {
    return null;
  }

  return {
    content: message.content,
    role: message.role,
    createdAt: message.createdAt.toISOString(),
    hasAttachments: message.attachmentIds.length > 0,
  };
}

function mapListRecord(thread: {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  deletedAt?: Date | null;
  lastActivityAt: Date;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: {
    content: string;
    role: "user" | "assistant" | "system" | "tool";
    createdAt: Date;
    attachmentIds: mongoose.Types.ObjectId[];
  } | null;
}): SafeThread {
  return {
    id: String(thread._id),
    userId: String(thread.userId),
    title: thread.title,
    lastActivityAt: thread.lastActivityAt.toISOString(),
    readAt: toReadAtIso(thread.readAt),
    unread: computeUnread(thread.lastActivityAt, thread.readAt),
    deletedAt: thread.deletedAt ? thread.deletedAt.toISOString() : null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessage: toSafeThreadLastMessage(thread.lastMessage),
  };
}

function toSafeThread(
  thread: ThreadDocument,
  lastMessage: SafeThreadLastMessage | null = null,
): SafeThread {
  return {
    id: String(thread._id),
    userId: String(thread.userId),
    title: thread.title,
    lastActivityAt: thread.lastActivityAt.toISOString(),
    readAt: toReadAtIso(thread.readAt),
    unread: computeUnread(thread.lastActivityAt, thread.readAt),
    deletedAt: thread.deletedAt ? thread.deletedAt.toISOString() : null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessage,
  };
}

export const threadService = {
  async create(userId: string, input: CreateThreadInput): Promise<SafeThread> {
    const title = input.title?.trim() || DEFAULT_TITLE;
    const now = new Date();

    const thread = await threadRepository.create({
      userId,
      title,
      lastActivityAt: now,
    });

    return toSafeThread(thread, null);
  },

  async list(userId: string): Promise<SafeThread[]> {
    const threads =
      await threadRepository.findActiveByUserIdWithLastMessage(userId);
    return threads.map(mapListRecord);
  },

  async listRecycleBin(userId: string): Promise<SafeThread[]> {
    const threads =
      await threadRepository.findRecycleBinByUserIdWithLastMessage(userId);
    return threads.map(mapListRecord);
  },

  async getById(userId: string, threadId: string): Promise<SafeThread> {
    const thread = await threadRepository.findActiveByIdForUser(
      threadId,
      userId,
    );

    if (!thread) {
      throw ApiError.notFound("Thread not found");
    }

    return toSafeThread(thread, null);
  },

  async update(
    userId: string,
    threadId: string,
    input: UpdateThreadInput,
  ): Promise<SafeThread> {
    const updates: {
      title?: string;
      lastActivityAt?: Date;
    } = {};

    if (input.title !== undefined) {
      updates.title = input.title.trim();
      updates.lastActivityAt = new Date();
    }

    const thread = await threadRepository.updateByIdForUser(
      threadId,
      userId,
      updates,
    );

    if (!thread || thread.deletedAt) {
      throw ApiError.notFound("Thread not found");
    }

    return toSafeThread(thread);
  },

  async remove(userId: string, threadId: string): Promise<void> {
    const thread = await threadRepository.softDeleteByIdForUser(
      threadId,
      userId,
    );

    if (!thread) {
      throw ApiError.notFound("Thread not found");
    }
  },

  async restore(userId: string, threadId: string): Promise<SafeThread> {
    const thread = await threadRepository.restoreByIdForUser(threadId, userId);

    if (!thread) {
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    return toSafeThread(thread);
  },

  async permanentlyDelete(userId: string, threadId: string): Promise<void> {
    const thread = await threadRepository.permanentlyDeleteByIdForUser(
      threadId,
      userId,
    );

    if (!thread) {
      throw ApiError.notFound("Thread not found in recycle bin");
    }
  },

  async markRead(
    userId: string,
    threadId: string,
    input: MarkThreadReadInput = {},
  ): Promise<SafeThread> {
    const thread = await threadRepository.findActiveByIdForUser(
      threadId,
      userId,
    );

    if (!thread) {
      throw ApiError.notFound("Thread not found");
    }

    const readAt = input.readAt ? new Date(input.readAt) : new Date();

    const updated = await threadRepository.updateByIdForUser(
      threadId,
      userId,
      { readAt },
    );

    if (!updated || updated.deletedAt) {
      throw ApiError.notFound("Thread not found");
    }

    return toSafeThread(updated);
  },
};
