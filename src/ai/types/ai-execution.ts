export type AiExecutionStatus = "running" | "success" | "failed";

export type AiExecutionTrigger = "orchestrator" | "api_run";

export type AiSpanStatus = "success" | "failed";

export type AiLlmCallRecord = {
  callSite: string;
  model: string;
  provider: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  status: AiSpanStatus;
  error?: string;
};

export type AiToolCallRecord = {
  tool: string;
  durationMs: number;
  status: AiSpanStatus;
  error?: string;
};

export type AiNodeSpanRecord = {
  node: string;
  durationMs: number;
  status: AiSpanStatus;
  error?: string;
};

export type AiExecutionError = {
  code?: string;
  message: string;
  phase?: "orchestrator" | "graph" | "llm" | "tool";
  node?: string;
  tool?: string;
};

export type SafeAiExecution = {
  id: string;
  userId: string;
  threadId: string;
  messageIds: string[];
  trigger: AiExecutionTrigger;
  status: AiExecutionStatus;
  intent?: string;
  model?: string;
  provider?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: AiLlmCallRecord[];
  toolCalls: AiToolCallRecord[];
  nodeSpans: AiNodeSpanRecord[];
  error?: AiExecutionError;
  graphError?: string;
  createdAt: string;
  updatedAt: string;
};
