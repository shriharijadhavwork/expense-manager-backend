import { randomUUID } from "node:crypto";
import { aiExecutionRepository } from "../../repositories/ai-execution.repository.js";
import { aiConfig } from "../config.js";
import { aiLogger } from "../observability/ai-logger.js";
import {
  aiExecutionContext,
  type MutableAiExecutionContext,
} from "../observability/execution-context.js";
import type {
  AiExecutionError,
  AiExecutionTrigger,
  AiLlmCallRecord,
} from "../types/ai-execution.js";

export type StartExecutionInput = {
  userId: string;
  threadId: string;
  messageIds: string[];
  trigger: AiExecutionTrigger;
};

export type RecordLlmCallInput = {
  callSite: string;
  model: string;
  provider: string;
  durationMs: number;
  attemptNumber?: number;
  fallbackFrom?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  status: "success" | "failed";
  error?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getPrimaryModel(ctx: MutableAiExecutionContext): string | undefined {
  return ctx.llmCalls.find((call) => call.status === "success")?.model;
}

function getPrimaryProvider(
  ctx: MutableAiExecutionContext,
): string | undefined {
  return ctx.llmCalls.find((call) => call.status === "success")?.provider;
}

export const aiExecutionService = {
  async runTracked<T>(
    input: StartExecutionInput,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!aiConfig.observabilityEnabled) {
      return fn();
    }

    if (aiExecutionContext.getStore()) {
      return fn();
    }

    const executionId = randomUUID();
    const ctx: MutableAiExecutionContext = {
      executionId,
      userId: input.userId,
      threadId: input.threadId,
      messageIds: input.messageIds,
      trigger: input.trigger,
      startedAt: Date.now(),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      llmCalls: [],
      toolCalls: [],
      nodeSpans: [],
    };

    if (aiConfig.persistExecutions) {
      await aiExecutionRepository.createRunning({
        executionId,
        userId: input.userId,
        threadId: input.threadId,
        messageIds: input.messageIds,
        trigger: input.trigger,
      });
    }

    aiLogger.info("ai_execution_started", {
      executionId,
      userId: input.userId,
      threadId: input.threadId,
      messageCount: input.messageIds.length,
      trigger: input.trigger,
    });

    return aiExecutionContext.run(ctx, async () => {
      try {
        const result = await fn();
        await this.complete(ctx, { status: "success" });
        return result;
      } catch (error) {
        await this.complete(ctx, {
          status: "failed",
          error: {
            message: getErrorMessage(error),
            phase: "graph",
          },
        });
        throw error;
      }
    });
  },

  async withNodeSpan<T>(
    nodeName: string,
    fn: () => Promise<T>,
    isSuccess: (result: T) => boolean = () => true,
  ): Promise<T> {
    return this.withSpan("node", nodeName, fn, isSuccess);
  },

  async withToolSpan<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    return this.withSpan("tool", toolName, fn);
  },

  async withSpan<T>(
    kind: "node" | "tool",
    name: string,
    fn: () => Promise<T>,
    isSuccess: (result: T) => boolean = () => true,
  ): Promise<T> {
    const ctx = aiExecutionContext.getStore();
    const startedAt = Date.now();

    try {
      const result = await fn();
      const durationMs = Date.now() - startedAt;
      const status = isSuccess(result) ? "success" : "failed";

      if (ctx) {
        if (kind === "node") {
          ctx.nodeSpans.push({ node: name, durationMs, status });
        } else {
          ctx.toolCalls.push({ tool: name, durationMs, status });
        }

        aiLogger.debug("ai_span_complete", {
          executionId: ctx.executionId,
          kind,
          name,
          durationMs,
          status,
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = getErrorMessage(error);

      if (ctx) {
        if (kind === "node") {
          ctx.nodeSpans.push({
            node: name,
            durationMs,
            status: "failed",
            error: message,
          });
        } else {
          ctx.toolCalls.push({
            tool: name,
            durationMs,
            status: "failed",
            error: message,
          });
        }

        aiLogger.warn("ai_span_failed", {
          executionId: ctx.executionId,
          kind,
          name,
          durationMs,
          error: message,
        });
      }

      throw error;
    }
  },

  recordLlmCall(input: RecordLlmCallInput): void {
    const ctx = aiExecutionContext.getStore();
    if (!ctx) {
      return;
    }

    const record: AiLlmCallRecord = {
      callSite: input.callSite,
      model: input.model,
      provider: input.provider,
      durationMs: input.durationMs,
      status: input.status,
      ...(input.attemptNumber !== undefined
        ? { attemptNumber: input.attemptNumber }
        : {}),
      ...(input.fallbackFrom ? { fallbackFrom: input.fallbackFrom } : {}),
      ...(input.promptTokens !== undefined
        ? { promptTokens: input.promptTokens }
        : {}),
      ...(input.completionTokens !== undefined
        ? { completionTokens: input.completionTokens }
        : {}),
      ...(input.totalTokens !== undefined
        ? { totalTokens: input.totalTokens }
        : {}),
      ...(input.error ? { error: input.error } : {}),
    };

    ctx.llmCalls.push(record);
    ctx.model = input.model;
    ctx.provider = input.provider;

    if (input.promptTokens) {
      ctx.promptTokens += input.promptTokens;
    }
    if (input.completionTokens) {
      ctx.completionTokens += input.completionTokens;
    }
    if (input.totalTokens) {
      ctx.totalTokens += input.totalTokens;
    }

    aiLogger.info("ai_llm_call", {
      executionId: ctx.executionId,
      callSite: input.callSite,
      model: input.model,
      provider: input.provider,
      durationMs: input.durationMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      status: input.status,
      ...(input.error ? { error: input.error } : {}),
    });
  },

  annotateGraphResult(input: {
    intent?: string;
    error?: string;
  }): void {
    const ctx = aiExecutionContext.getStore();
    if (!ctx) {
      return;
    }

    if (input.intent) {
      ctx.intent = input.intent;
    }
    if (input.error) {
      ctx.graphError = input.error;
    }
  },

  async complete(
    ctx: MutableAiExecutionContext,
    outcome: {
      status: "success" | "failed";
      error?: AiExecutionError;
    },
  ): Promise<void> {
    const finishedAt = new Date();
    const durationMs = Date.now() - ctx.startedAt;

    aiLogger.info("ai_execution_complete", {
      executionId: ctx.executionId,
      userId: ctx.userId,
      threadId: ctx.threadId,
      trigger: ctx.trigger,
      status: outcome.status,
      intent: ctx.intent,
      model: getPrimaryModel(ctx),
      provider: getPrimaryProvider(ctx),
      durationMs,
      promptTokens: ctx.promptTokens,
      completionTokens: ctx.completionTokens,
      totalTokens: ctx.totalTokens,
      llmCallCount: ctx.llmCalls.length,
      toolCallCount: ctx.toolCalls.length,
      nodeSpanCount: ctx.nodeSpans.length,
      ...(ctx.graphError ? { graphError: ctx.graphError } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
    });

    if (!aiConfig.persistExecutions) {
      return;
    }

    await aiExecutionRepository.finalize({
      executionId: ctx.executionId,
      status: outcome.status,
      finishedAt,
      durationMs,
      promptTokens: ctx.promptTokens,
      completionTokens: ctx.completionTokens,
      totalTokens: ctx.totalTokens,
      llmCalls: ctx.llmCalls,
      toolCalls: ctx.toolCalls,
      nodeSpans: ctx.nodeSpans,
      ...(ctx.intent ? { intent: ctx.intent } : {}),
      ...(getPrimaryModel(ctx) ? { model: getPrimaryModel(ctx) } : {}),
      ...(getPrimaryProvider(ctx) ? { provider: getPrimaryProvider(ctx) } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(ctx.graphError ? { graphError: ctx.graphError } : {}),
    });
  },

  async listForThread(
    threadId: string,
    userId: string,
    limit = 20,
  ) {
    return aiExecutionRepository.findByThreadForUser(threadId, userId, limit);
  },
};
