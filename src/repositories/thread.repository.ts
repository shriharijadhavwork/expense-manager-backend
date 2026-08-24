import mongoose from "mongoose";
import { getRecycleBinCutoffDate } from "../config/thread.constants.js";
import {
  Thread,
  type ThreadDocument,
} from "../models/thread.model.js";
import type { MessageRole } from "../models/message.model.js";

export type CreateThreadRecord = {
  userId: string;
  title: string;
  lastActivityAt?: Date;
};

export type UpdateThreadRecord = {
  title?: string;
  lastActivityAt?: Date;
  readAt?: Date | null;
  deletedAt?: Date | null;
};

export type ThreadLastMessageRecord = {
  content: string;
  role: MessageRole;
  createdAt: Date;
  attachmentIds: mongoose.Types.ObjectId[];
};

export type ThreadListRecord = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  deletedAt: Date | null;
  lastActivityAt: Date;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: ThreadLastMessageRecord | null;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function activeThreadMatch(userId: string): Record<string, unknown> {
  return {
    userId: toObjectId(userId),
    deletedAt: null,
  };
}

function recycleBinMatch(userId: string, cutoff: Date): Record<string, unknown> {
  return {
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
      userId: toObjectId(input.userId),
      title: input.title,
      status: "active",
      deletedAt: null,
      lastActivityAt: now,
    });
  },

  async findActiveByUserIdWithLastMessage(
    userId: string,
  ): Promise<ThreadListRecord[]> {
    return Thread.aggregate<ThreadListRecord>([
      { $match: activeThreadMatch(userId) },
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

  async findActiveByIdForUser(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    return Thread.findOne({
      _id: toObjectId(threadId),
      ...activeThreadMatch(userId),
    }).exec();
  },

  async findByIdForUserIncludingDeleted(
    threadId: string,
    userId: string,
  ): Promise<ThreadDocument | null> {
    return Thread.findOne({
      _id: toObjectId(threadId),
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
        userId: toObjectId(userId),
      },
      { $set: updates },
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
        ...activeThreadMatch(userId),
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
