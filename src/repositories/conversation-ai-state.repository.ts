import mongoose from "mongoose";
import {
  ConversationAiState,
  type ConversationAiStateDocument,
  type ConversationExpenseDraft,
} from "../models/conversation-ai-state.model.js";

export type UpdateConversationAiStateRecord = {
  expectedVersion: number;
  userId: string;
  currentIntent?: string | null;
  expenseDraft?: ConversationExpenseDraft | null;
  missingRequiredFields?: string[] | null;
  lastProcessedMessageId: string;
  lastProcessedAt?: Date;
  summary?: string | null;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const conversationAiStateRepository = {
  async findByThreadId(
    threadId: string,
  ): Promise<ConversationAiStateDocument | null> {
    return ConversationAiState.findOne({ threadId: toObjectId(threadId) }).exec();
  },

  async createForThread(
    threadId: string,
    userId: string,
  ): Promise<ConversationAiStateDocument> {
    return ConversationAiState.create({
      threadId: toObjectId(threadId),
      userId: toObjectId(userId),
      version: 0,
    });
  },

  async getOrCreateForThread(
    threadId: string,
    userId: string,
  ): Promise<ConversationAiStateDocument> {
    const existing = await this.findByThreadId(threadId);
    if (existing) {
      return existing;
    }

    return this.createForThread(threadId, userId);
  },

  async updateAfterTurn(
    threadId: string,
    input: UpdateConversationAiStateRecord,
  ): Promise<ConversationAiStateDocument | null> {
    const $set: Record<string, unknown> = {
      userId: toObjectId(input.userId),
      lastProcessedAt: input.lastProcessedAt ?? new Date(),
      lastProcessedMessageId: toObjectId(input.lastProcessedMessageId),
    };
    const $unset: Record<string, 1> = {};

    if (input.currentIntent) {
      $set["currentIntent"] = input.currentIntent;
    } else {
      $unset["currentIntent"] = 1;
    }

    if (input.expenseDraft) {
      $set["expenseDraft"] = input.expenseDraft;
    } else {
      $unset["expenseDraft"] = 1;
    }

    if (input.missingRequiredFields && input.missingRequiredFields.length > 0) {
      $set["missingRequiredFields"] = input.missingRequiredFields;
    } else {
      $unset["missingRequiredFields"] = 1;
    }

    if (input.summary) {
      $set["summary"] = input.summary;
    } else if (input.summary === null) {
      $unset["summary"] = 1;
    }

    const update: Record<string, unknown> = {
      $set,
      $inc: { version: 1 },
    };

    if (Object.keys($unset).length > 0) {
      update["$unset"] = $unset;
    }

    return ConversationAiState.findOneAndUpdate(
      {
        threadId: toObjectId(threadId),
        version: input.expectedVersion,
      },
      update,
      { returnDocument: "after", runValidators: true },
    ).exec();
  },
};
