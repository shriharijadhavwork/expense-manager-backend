export type ErrorEventSource =
  | "ai_llm"
  | "ai_orchestrator"
  | "ai_tool"
  | "api"
  | "service"
  | "unknown";

export type RecordErrorEventInput = {
  source: ErrorEventSource;
  userId?: string;
  threadId?: string;
  messageId?: string;
  executionId?: string;
  model?: string;
  callSite?: string;
  httpStatus?: number;
  errorCode?: string;
  requestPayload?: Record<string, unknown>;
  error: unknown;
};

export type SafeErrorEvent = {
  id: string;
  source: ErrorEventSource;
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
  createdAt: string;
  updatedAt: string;
};
