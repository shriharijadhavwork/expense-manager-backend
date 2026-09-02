import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AiExecutionTrigger,
  AiLlmCallRecord,
  AiNodeSpanRecord,
  AiToolCallRecord,
} from "../types/ai-execution.js";

export type MutableAiExecutionContext = {
  executionId: string;
  userId: string;
  threadId: string;
  messageIds: string[];
  trigger: AiExecutionTrigger;
  startedAt: number;
  intent?: string;
  model?: string;
  provider?: string;
  graphError?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: AiLlmCallRecord[];
  toolCalls: AiToolCallRecord[];
  nodeSpans: AiNodeSpanRecord[];
};

export const aiExecutionContext =
  new AsyncLocalStorage<MutableAiExecutionContext>();
