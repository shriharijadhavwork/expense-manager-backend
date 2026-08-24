import mongoose from "mongoose";
import {
  Message,
  type MessageDocument,
  type MessageRole,
} from "../models/message.model.js";

export type CreateMessageRecord = {
  threadId: string;
  userId: string;
  role: MessageRole;
  content: string;
  attachmentIds?: string[];
};

export type ListMessagesOptions = {
  limit: number;
  before?: string;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const messageRepository = {
  async create(input: CreateMessageRecord): Promise<MessageDocument> {
    return Message.create({
      threadId: toObjectId(input.threadId),
      userId: toObjectId(input.userId),
      role: input.role,
      content: input.content,
      attachmentIds: (input.attachmentIds ?? []).map(toObjectId),
    });
  },

  async findByIdForThread(
    messageId: string,
    threadId: string,
    userId: string,
  ): Promise<MessageDocument | null> {
    return Message.findOne({
      _id: toObjectId(messageId),
      threadId: toObjectId(threadId),
      userId: toObjectId(userId),
    }).exec();
  },

  async addExpenseId(
    messageId: string,
    threadId: string,
    userId: string,
    expenseId: string,
  ): Promise<MessageDocument | null> {
    return Message.findOneAndUpdate(
      {
        _id: toObjectId(messageId),
        threadId: toObjectId(threadId),
        userId: toObjectId(userId),
      },
      { $addToSet: { expenseIds: toObjectId(expenseId) } },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async listByThread(
    threadId: string,
    userId: string,
    options: ListMessagesOptions,
  ): Promise<MessageDocument[]> {
    const filter: Record<string, unknown> = {
      threadId: toObjectId(threadId),
      userId: toObjectId(userId),
    };

    if (options.before) {
      const cursor = await Message.findOne({
        _id: toObjectId(options.before),
        threadId: toObjectId(threadId),
        userId: toObjectId(userId),
      }).exec();

      if (!cursor) {
        return [];
      }

      filter["$or"] = [
        { createdAt: { $lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          _id: { $lt: cursor._id },
        },
      ];
    }

    return Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit + 1)
      .exec();
  },
};
