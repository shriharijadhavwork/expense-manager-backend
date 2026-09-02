import { aiExecutionContext } from "../observability/execution-context.js";
import { errorLogService } from "../../services/error-log.service.js";
import type { RecordErrorEventInput } from "../../types/error-event.js";

export function getAiLogContext(): {
  userId?: string;
  threadId?: string;
  messageId?: string;
  executionId?: string;
} {
  const ctx = aiExecutionContext.getStore();
  if (!ctx) {
    return {};
  }

  return {
    userId: ctx.userId,
    threadId: ctx.threadId,
    messageId: ctx.messageIds.at(-1),
    executionId: ctx.executionId,
  };
}

export function recordAiError(
  input: Omit<RecordErrorEventInput, "source"> & {
    source?: RecordErrorEventInput["source"];
  },
): void {
  const context = getAiLogContext();

  errorLogService.record({
    source: input.source ?? "ai_llm",
    userId: input.userId ?? context.userId,
    threadId: input.threadId ?? context.threadId,
    messageId: input.messageId ?? context.messageId,
    executionId: input.executionId ?? context.executionId,
    model: input.model,
    callSite: input.callSite,
    httpStatus: input.httpStatus,
    errorCode: input.errorCode,
    requestPayload: input.requestPayload,
    error: input.error,
  });
}
