import mongoose from "mongoose";
import { threadRepository } from "../repositories/thread.repository.js";
import { groupMemberRepository } from "../repositories/group-member.repository.js";
import { userPreferencesRepository } from "../repositories/user-preferences.repository.js";
import type { ThreadDocument } from "../models/thread.model.js";
import type {
  CreateThreadInput,
  MarkThreadReadInput,
  UpdateThreadInput,
} from "../schemas/thread.schema.js";
import { ApiError } from "../utils/api-error.js";
import {
  formatThreadTitle,
  getDayKey,
  resolveEffectiveTimezone,
} from "../utils/thread-title.js";

export type SafeThreadLastMessage = {
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt: string;
  hasAttachments: boolean;
};

export type SafeThread = {
  id: string;
  type: "personal" | "group";
  userId: string | null;
  groupId: string | null;
  createdBy: string;
  dayKey: string;
  sequence: number;
  title: string;
  lastActivityAt: string;
  readAt: string | null;
  unread: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: SafeThreadLastMessage | null;
  /** Present on recycle-bin listings: whether the viewer may restore/purge. */
  canManageRecycle?: boolean;
};

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
  type: "personal" | "group";
  userId: mongoose.Types.ObjectId | null;
  groupId: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  dayKey: string;
  sequence: number;
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
    type: thread.type,
    userId: thread.userId ? String(thread.userId) : null,
    groupId: thread.groupId ? String(thread.groupId) : null,
    createdBy: String(thread.createdBy),
    dayKey: thread.dayKey,
    sequence: thread.sequence,
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
  options?: { canManageRecycle?: boolean },
): SafeThread {
  return {
    id: String(thread._id),
    type: thread.type,
    userId: thread.userId ? String(thread.userId) : null,
    groupId: thread.groupId ? String(thread.groupId) : null,
    createdBy: String(thread.createdBy),
    dayKey: thread.dayKey,
    sequence: thread.sequence,
    title: thread.title,
    lastActivityAt: thread.lastActivityAt.toISOString(),
    readAt: toReadAtIso(thread.readAt),
    unread: computeUnread(thread.lastActivityAt, thread.readAt),
    deletedAt: thread.deletedAt ? thread.deletedAt.toISOString() : null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessage,
    ...(options?.canManageRecycle !== undefined
      ? { canManageRecycle: options.canManageRecycle }
      : {}),
  };
}

async function canManageThreadRecycle(
  userId: string,
  thread: Pick<ThreadDocument, "type" | "userId" | "groupId" | "createdBy">,
): Promise<boolean> {
  if (thread.type === "personal") {
    return Boolean(thread.userId && String(thread.userId) === userId);
  }

  if (String(thread.createdBy) === userId) {
    return true;
  }

  if (!thread.groupId) {
    return false;
  }

  const membership = await groupMemberRepository.findActiveMembership(
    String(thread.groupId),
    userId,
  );

  return membership?.role === "owner";
}

export const threadService = {
  async create(userId: string, input: CreateThreadInput): Promise<SafeThread> {
    const preferences =
      await userPreferencesRepository.getOrCreateForUser(userId);
    const timeZone = resolveEffectiveTimezone(preferences.timezone);
    const now = new Date();
    const dayKey = getDayKey(now, timeZone);
    const sequence = await threadRepository.getNextPersonalSequence(
      userId,
      dayKey,
    );
    const title = input.title?.trim() || formatThreadTitle(dayKey, sequence);

    const thread = await threadRepository.create({
      type: "personal",
      userId,
      groupId: null,
      createdBy: userId,
      dayKey,
      sequence,
      title,
      lastActivityAt: now,
    });

    return toSafeThread(thread, null);
  },

  async createForGroup(
    actorUserId: string,
    groupId: string,
    input: { title?: string } = {},
  ): Promise<SafeThread> {
    const membership = await groupMemberRepository.findActiveMembership(
      groupId,
      actorUserId,
    );
    if (!membership) {
      throw ApiError.notFound("Group not found");
    }

    const preferences =
      await userPreferencesRepository.getOrCreateForUser(actorUserId);
    const timeZone = resolveEffectiveTimezone(preferences.timezone);
    const now = new Date();
    const dayKey = getDayKey(now, timeZone);
    const sequence = await threadRepository.getNextGroupSequence(
      groupId,
      dayKey,
    );
    const title = input.title?.trim() || formatThreadTitle(dayKey, sequence);

    const thread = await threadRepository.create({
      type: "group",
      userId: null,
      groupId,
      createdBy: actorUserId,
      dayKey,
      sequence,
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

  async listForGroup(
    actorUserId: string,
    groupId: string,
  ): Promise<SafeThread[]> {
    const membership = await groupMemberRepository.findActiveMembership(
      groupId,
      actorUserId,
    );
    if (!membership) {
      throw ApiError.notFound("Group not found");
    }

    const threads =
      await threadRepository.findActiveByGroupIdWithLastMessage(groupId);
    return threads.map(mapListRecord);
  },

  /**
   * Personal owner or active group member. Optionally include soft-deleted threads.
   */
  async requireAccessibleThread(
    userId: string,
    threadId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ThreadDocument> {
    const thread = await threadRepository.findById(threadId);
    if (!thread) {
      throw ApiError.notFound("Thread not found");
    }

    if (!options.includeDeleted && thread.deletedAt) {
      throw ApiError.notFound("Thread not found");
    }

    if (thread.type === "personal") {
      if (!thread.userId || String(thread.userId) !== userId) {
        throw ApiError.notFound("Thread not found");
      }
      return thread;
    }

    if (!thread.groupId) {
      throw ApiError.notFound("Thread not found");
    }

    const membership = await groupMemberRepository.findActiveMembership(
      String(thread.groupId),
      userId,
    );
    if (!membership) {
      throw ApiError.notFound("Thread not found");
    }

    return thread;
  },

  async listRecycleBin(userId: string): Promise<SafeThread[]> {
    const memberships =
      await groupMemberRepository.findActiveByUserId(userId);
    const groupIds = memberships.map((membership) =>
      String(membership.groupId),
    );
    const ownedGroupIds = new Set(
      memberships
        .filter((membership) => membership.role === "owner")
        .map((membership) => String(membership.groupId)),
    );

    const [personal, groupThreads] = await Promise.all([
      threadRepository.findRecycleBinByUserIdWithLastMessage(userId),
      threadRepository.findRecycleBinByGroupIdsWithLastMessage(groupIds),
    ]);

    const merged = [...personal, ...groupThreads].sort((left, right) => {
      const leftTime = (left.deletedAt ?? left.updatedAt).getTime();
      const rightTime = (right.deletedAt ?? right.updatedAt).getTime();
      return rightTime - leftTime;
    });

    return merged.map((thread) => {
      const safe = mapListRecord(thread);
      const canManageRecycle =
        thread.type === "personal"
          ? true
          : String(thread.createdBy) === userId ||
            (thread.groupId
              ? ownedGroupIds.has(String(thread.groupId))
              : false);

      return { ...safe, canManageRecycle };
    });
  },

  async getById(userId: string, threadId: string): Promise<SafeThread> {
    const thread = await threadService.requireAccessibleThread(
      userId,
      threadId,
      { includeDeleted: true },
    );

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

    const existing = await threadService.requireAccessibleThread(
      userId,
      threadId,
    );

    if (existing.type === "personal") {
      const thread = await threadRepository.updateByIdForUser(
        threadId,
        userId,
        updates,
      );

      if (!thread || thread.deletedAt) {
        throw ApiError.notFound("Thread not found");
      }

      return toSafeThread(thread);
    }

    const thread = await threadRepository.updateById(threadId, updates);
    if (!thread || thread.deletedAt) {
      throw ApiError.notFound("Thread not found");
    }

    return toSafeThread(thread);
  },

  async remove(userId: string, threadId: string): Promise<void> {
    const thread = await threadRepository.findById(threadId);
    if (!thread || thread.deletedAt) {
      throw ApiError.notFound("Thread not found");
    }

    const allowed = await canManageThreadRecycle(userId, thread);
    if (!allowed) {
      // Hide existence from unauthorized callers
      if (thread.type === "personal") {
        throw ApiError.notFound("Thread not found");
      }

      const membership = thread.groupId
        ? await groupMemberRepository.findActiveMembership(
            String(thread.groupId),
            userId,
          )
        : null;
      if (!membership) {
        throw ApiError.notFound("Thread not found");
      }

      throw ApiError.forbidden(
        "Only the thread creator or group owner can delete this conversation",
      );
    }

    const deleted = await threadRepository.softDeleteById(threadId);
    if (!deleted) {
      throw ApiError.notFound("Thread not found");
    }
  },

  async restore(userId: string, threadId: string): Promise<SafeThread> {
    const thread = await threadRepository.findById(threadId);
    if (!thread) {
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    const allowed = await canManageThreadRecycle(userId, thread);
    if (!allowed) {
      if (thread.type === "group" && thread.groupId) {
        const membership = await groupMemberRepository.findActiveMembership(
          String(thread.groupId),
          userId,
        );
        if (membership) {
          throw ApiError.forbidden(
            "Only the thread creator or group owner can restore this conversation",
          );
        }
      }
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    const restored = await threadRepository.restoreById(threadId);
    if (!restored) {
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    return toSafeThread(restored);
  },

  async permanentlyDelete(userId: string, threadId: string): Promise<void> {
    const thread = await threadRepository.findById(threadId);
    if (!thread) {
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    const allowed = await canManageThreadRecycle(userId, thread);
    if (!allowed) {
      if (thread.type === "group" && thread.groupId) {
        const membership = await groupMemberRepository.findActiveMembership(
          String(thread.groupId),
          userId,
        );
        if (membership) {
          throw ApiError.forbidden(
            "Only the thread creator or group owner can permanently delete this conversation",
          );
        }
      }
      throw ApiError.notFound("Thread not found in recycle bin");
    }

    const deleted = await threadRepository.permanentlyDeleteById(threadId);
    if (!deleted) {
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
