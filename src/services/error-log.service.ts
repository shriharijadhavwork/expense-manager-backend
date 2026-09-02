import mongoose from "mongoose";
import {
  ErrorEvent,
  type ErrorEventDocument,
} from "../models/error-event.model.js";
import type { RecordErrorEventInput } from "../types/error-event.js";
import { serializeError } from "../utils/serialize-error.js";
import { sanitizeLogPayload } from "../utils/sanitize-log-payload.js";
import {
  classifyLlmErrorCode,
  parseHttpStatusFromError,
} from "../ai/utils/parse-llm-error-code.js";

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const errorEventRepository = {
  async create(input: {
    source: RecordErrorEventInput["source"];
    userId?: string;
    threadId?: string;
    messageId?: string;
    executionId?: string;
    model?: string;
    callSite?: string;
    httpStatus?: number;
    errorCode?: string;
    requestPayload?: Record<string, unknown>;
    errorPayload: Record<string, unknown>;
  }): Promise<ErrorEventDocument> {
    return ErrorEvent.create({
      source: input.source,
      ...(input.userId ? { userId: toObjectId(input.userId) } : {}),
      ...(input.threadId ? { threadId: toObjectId(input.threadId) } : {}),
      ...(input.messageId ? { messageId: toObjectId(input.messageId) } : {}),
      ...(input.executionId ? { executionId: input.executionId } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.callSite ? { callSite: input.callSite } : {}),
      ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.requestPayload ? { requestPayload: input.requestPayload } : {}),
      errorPayload: input.errorPayload,
    });
  },
};

export const errorLogService = {
  record(input: RecordErrorEventInput): void {
    void this.recordAsync(input).catch((error) => {
      console.error("[error-log] Failed to persist error event", error);
    });
  },

  async recordAsync(input: RecordErrorEventInput): Promise<ErrorEventDocument | null> {
    const { env } = await import("../config/env.js");

    if (!env.ERROR_LOG_PERSIST) {
      return null;
    }

    const httpStatus = input.httpStatus ?? parseHttpStatusFromError(input.error);
    const errorCode =
      input.errorCode ??
      (input.source === "ai_llm"
        ? classifyLlmErrorCode(input.error)
        : "APP_ERROR");

    return errorEventRepository.create({
      source: input.source,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.executionId ? { executionId: input.executionId } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.callSite ? { callSite: input.callSite } : {}),
      httpStatus,
      errorCode,
      ...(input.requestPayload
        ? { requestPayload: sanitizeLogPayload(input.requestPayload) }
        : {}),
      errorPayload: serializeError(input.error),
    });
  },
};
