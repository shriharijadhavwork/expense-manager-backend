import mongoose from "mongoose";
import {
  computeMessageWindowEndsAt,
  getRecycleBinCutoffDate,
} from "../config/thread.constants.js";
import {
  Thread,
  type ThreadDocument,
  type ThreadType,
} from "../models/thread.model.js";
import type { MessageRole } from "../models/message.model.js";

export type CreateThreadRecord = {
  type: ThreadType;
  userId: string | null;
  groupId: string | null;
  createdBy: string;
  dayKey: string;
  sequence: number;
  title: string;
  lastActivityAt?: Date;
};

export type UpdateThreadRecord = {
  title?: string;
  lastActivityAt?: Date;
  readAt?: Date | null;
  deletedAt?: Date | null;
  userMessageCount?: number;
  assistantMessageCount?: number;
};

export type ThreadMessageCountDelta = {
  userMessageCount?: number;
  assistantMessageCount?: number;
};

export type ThreadLastMessageRecord = {
  content: string;
  role: MessageRole;
  createdAt: Date;
  attachmentIds: mongoose.Types.ObjectId[];
};

export type ThreadListRecord = {
  _id: mongoose.Types.ObjectId;
  type: ThreadType;
  userId: mongoose.Types.ObjectId | null;
  groupId: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  dayKey: string;
  sequence: number;
  title: string;
  deletedAt: Date | null;
  lastActivityAt: Date;
  readAt?: Date | null;
  messageWindowEndsAt: Date;
  userMessageCount: number;
  assistantMessageCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: ThreadLastMessageRecord | null;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function activePersonalThreadMatch(userId: string): Record<string, unknown> {
  return {
    type: "personal",
    userId: toObjectId(userId),
    deletedAt: null,
  };
}

function recycleBinMatch(userId: string, cutoff: Date): Record<string, unknown> {
  return {
    type: "personal",
    userId: toObjectId(userId),
    $or: [
      { deletedAt: { $gte: cutoff } },
      {
        deletedAt: null,
        status: "archived",
        updatedAt: { $gte: cutoff },
      },
    ],
  };
}

function recycleWindowMatch(cutoff: Date): Record<string, unknown> {
  return {
    $or: [
      { deletedAt: { $gte: cutoff } },
      {
        deletedAt: null,
        status: "archived",
        updatedAt: { $gte: cutoff },
      },
    ],
  };
}

function groupRecycleBinMatch(
  groupIds: string[],
  cutoff: Date,
): Record<string, unknown> {
  return {
    type: "group",
    groupId: { $in: groupIds.map(toObjectId) },
    ...recycleWindowMatch(cutoff),
  };
}

function lastMessageLookupStages() {
  return [
    {
      $lookup: {
        from: "messages",
        localField: "_id",
        foreignField: "threadId",
        as: "lastMessageDocs",
        pipeline: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          {
            $project: {
              content: 1,
              role: 1,
              createdAt: 1,
              attachmentIds: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        lastMessage: {
          $arrayElemAt: ["$lastMessageDocs", 0],
        },
      },
    },
    {
      $project: {
        lastMessageDocs: 0,
        status: 0,
      },
    },
  ];
}

export const threadRepository = {
  async create(input: CreateThreadRecord): Promise<ThreadDocument> {
    const now = input.lastActivityAt ?? new Date();

    return Thread.create({
      type: input.type,
      userId: input.userId ? toObjectId(input.userId) : null,
      groupId: input.groupId ? toObjectId(input.groupId) : null,
      createdBy: toObjectId(input.createdBy),
      dayKey: input.dayKey,
      sequence: input.sequence,
      title: input.title,
      status: "active",
      deletedAt: null,
      lastActivityAt: now,
      messageWindowEndsAt: computeMessageWindowEndsAt(now),
      userMessageCount: 0,
      assistantMessageCount: 0,
    });
  },

  async getNextPersonalSequence(
    userId: string,
    dayKey: string,
  ): Promise<number> {
    const latest = await Thread.findOne({
      type: "personal",
      userId: toObjectId(userId),
      dayKey,
    })
      .sort({ sequence: -1 })
      .select({ sequence: 1 })
      .lean()
      .exec();

    return (latest?.sequence ?? 0) + 1;
  },

  async getNextGroupSequence(groupId: string, dayKey: string): Promise<number> {
    const latest = await Thread.findOne({
      type: "group",
      groupId: toObjectId(groupId),
      dayKey,
    })
      .sort({ sequence: -1 })
      .select({ sequence: 1 })
      .lean()
      .exec();

    return (latest?.sequence ?? 0) + 1;
  },

  async findById(threadId: string): Promise<ThreadDocument | null> {
    return Thread.findById(threadId).exec();
  },

  async findActiveByGroupIdWithLastMessage(
    groupId: string,
  ): Promise<ThreadListRecord[]> {
    return Thread.aggregate<ThreadListRecord>([
      {
        $match: {
          type: "group",
          groupId: toObjectId(groupId),
          deletedAt: null,
        },
      },
      { $sort: { lastActivityAt: -1, createdAt: -1 } },
      ...lastMessageLookupStages(),
    ]).exec();
  },

  async updateById(
    threadId: string,
    updates: UpdateThreadRecord,
  ): Promise<ThreadDocument | null> {
    return Thread.findByIdAndUpdate(
      threadId,
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async findActiveByUserIdWithLastMessage(
    userId: string,
  ): Promise<ThreadListRecord[]> {
    return Thread.aggregate<ThreadListRecord>([
      { $match: activePersonalThreadMatch(userId) },
      { $sort: { lastActivityAt: -1, createdAt: -1 } },
      ...lastMessageLookupStages(),
    ]).exec();
  },

  async findRecycleBinByUserIdWithLastMessage(
    userId: string,
    cutoff = getRecycleBinCutoffDate(),
  ): Promise<ThreadListRecord[]> {
    return Thread.aggregate<ThreadListRecord>([
      { $match: recycleBinMatch(userId, cutoff) },
      { $sort: { deletedAt: -1, updatedAt: -1, createdAt: -1 } },
      ...lastMessageLookupStages(),
    ]).exec();
  },

  async findRecycleBinByGroupIdsWithLastMessage(
    groupIds: string[],
    cutoff = getRecycleBinCutoffDate(),
  ): Promise<ThreadListRecord[]> {
    if (groupIds.length === 0) {
      return [];
    }

    return Thread.aggregate<ThreadListRecord>([
      { $match: groupRecycleBinMatch(groupIds, cutoff) },
      { $sort: { deletedAt: -1, updatedAt: -1, createdAt: -1 } },
      ...lastMessageLookupStages(),
    ]).exec();
  },

  async softDeleteById(
    threadId: string,
    deletedAt = new Date(),
  ): Promise<ThreadDocument | null> {
    return Thread.findOneAndUpdate(
      {
        _id: toObjectId(threadId),
        deletedAt: null,
      },
      {
        $set: {
          deletedAt,
          status: "archived",
        },
      },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async restoreById(threadId: string): Promise<ThreadDocument | null> {
    const cutoff = getRecycleBinCutoffDate();

    return Thread.findOneAndUpdate(
      {
        _id: toObjectId(threadId),
        ...recycleWindowMatch(cutoff),
      },
      {
        $set: {
          deletedAt: null,
          status: "active",
          lastActivityAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async permanentlyDeleteById(
    threadId: string,
  ): Promise<ThreadDocument | null> {
    const cutoff = getRecycleBinCutoffDate();

    return Thread.findOneAndDelete({
      _id: toObjectId(threadId),
      ...recycleWindowMatch(cutoff),
    }).exec();
  },

  async findActiveByIdForUser(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    return Thread.findOne({
      _id: toObjectId(threadId),
      ...activePersonalThreadMatch(userId),
    }).exec();
  },

  async findByIdForUserIncludingDeleted(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    return Thread.findOne({
      _id: toObjectId(threadId),
      type: "personal",
      userId: toObjectId(userId),
    }).exec();
  },

  async updateByIdForUser(
    threadId: string,
    userId: string,
    updates: UpdateThreadRecord,
  ): Promise<ThreadDocument | null> {
    return Thread.findOneAndUpdate(
      {
        _id: toObjectId(threadId),
        type: "personal",
        userId: toObjectId(userId),
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async incrementMessageCounts(
    threadId: string,
    delta: ThreadMessageCountDelta,
  ): Promise<ThreadDocument | null> {
    const inc: Record<string, number> = {};

    if (delta.userMessageCount) {
      inc["userMessageCount"] = delta.userMessageCount;
    }

    if (delta.assistantMessageCount) {
      inc["assistantMessageCount"] = delta.assistantMessageCount;
    }

    if (Object.keys(inc).length === 0) {
      return Thread.findById(threadId).exec();
    }

    return Thread.findByIdAndUpdate(
      threadId,
      { $inc: inc },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async softDeleteByIdForUser(
    threadId: string,
    userId: string,
    deletedAt = new Date(),
  ): Promise<ThreadDocument | null> {
    return Thread.findOneAndUpdate(
      {
        _id: toObjectId(threadId),
        ...activePersonalThreadMatch(userId),
      },
      {
        $set: {
          deletedAt,
          status: "archived",
        },
      },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async restoreByIdForUser(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    const cutoff = getRecycleBinCutoffDate();

    return Thread.findOneAndUpdate(
      {
        _id: toObjectId(threadId),
        type: "personal",
        userId: toObjectId(userId),
        $or: [
          { deletedAt: { $gte: cutoff } },
          {
            deletedAt: null,
            status: "archived",
            updatedAt: { $gte: cutoff },
          },
        ],
      },
      {
        $set: {
          deletedAt: null,
          status: "active",
          lastActivityAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async permanentlyDeleteByIdForUser(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    const cutoff = getRecycleBinCutoffDate();

    return Thread.findOneAndDelete({
      _id: toObjectId(threadId),
      type: "personal",
      userId: toObjectId(userId),
      $or: [
        { deletedAt: { $gte: cutoff } },
        {
          deletedAt: null,
          status: "archived",
          updatedAt: { $gte: cutoff },
        },
      ],
    }).exec();
  },
};
