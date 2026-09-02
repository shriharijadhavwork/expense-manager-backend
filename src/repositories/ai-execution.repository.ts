import mongoose from "mongoose";
import {
  AiExecution,
  type AiExecutionDocument,
} from "../models/ai-execution.model.js";
import type {
  AiExecutionError,
  AiExecutionStatus,
  AiExecutionTrigger,
  AiLlmCallRecord,
  AiNodeSpanRecord,
  AiToolCallRecord,
} from "../ai/types/ai-execution.js";

export type CreateRunningExecutionInput = {
  executionId: string;
  userId: string;
  threadId: string;
  messageIds: string[];
  trigger: AiExecutionTrigger;
};

export type FinalizeExecutionInput = {
  executionId: string;
  status: Exclude<AiExecutionStatus, "running">;
  intent?: string;
  model?: string;
  provider?: string;
  finishedAt: Date;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: AiLlmCallRecord[];
  toolCalls: AiToolCallRecord[];
  nodeSpans: AiNodeSpanRecord[];
  error?: AiExecutionError;
  graphError?: string;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const aiExecutionRepository = {
  async createRunning(
    input: CreateRunningExecutionInput,
  ): Promise<AiExecutionDocument> {
    return AiExecution.create({
      executionId: input.executionId,
      userId: toObjectId(input.userId),
      threadId: toObjectId(input.threadId),
      messageIds: input.messageIds.map(toObjectId),
      trigger: input.trigger,
      status: "running",
      startedAt: new Date(),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      llmCalls: [],
      toolCalls: [],
      nodeSpans: [],
    });
  },

  async finalize(
    input: FinalizeExecutionInput,
  ): Promise<AiExecutionDocument | null> {
    const $set: Record<string, unknown> = {
      status: input.status,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      llmCalls: input.llmCalls,
      toolCalls: input.toolCalls,
      nodeSpans: input.nodeSpans,
    };

    if (input.intent) {
      $set["intent"] = input.intent;
    }
    if (input.model) {
      $set["model"] = input.model;
    }
    if (input.provider) {
      $set["provider"] = input.provider;
    }
    if (input.error) {
      $set["error"] = input.error;
    }
    if (input.graphError) {
      $set["graphError"] = input.graphError;
    }

    return AiExecution.findOneAndUpdate(
      { executionId: input.executionId },
      { $set },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async findByThreadForUser(
    threadId: string,
    userId: string,
    limit = 20,
  ): Promise<AiExecutionDocument[]> {
    return AiExecution.find({
      threadId: toObjectId(threadId),
      userId: toObjectId(userId),
    })
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
  },

  async findByExecutionIdForUser(
    executionId: string,
    userId: string,
  ): Promise<AiExecutionDocument | null> {
    return AiExecution.findOne({
      executionId,
      userId: toObjectId(userId),
    }).exec();
  },
};
