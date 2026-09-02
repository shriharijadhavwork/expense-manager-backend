import { env } from "../config/env.js";

export const aiConfig = {
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
  debounceMs: env.AI_DEBOUNCE_MS,
  logLlmPayloads: env.AI_LOG_LLM_PAYLOADS,
  persistExecutions: env.AI_PERSIST_EXECUTIONS,
  observabilityEnabled: true,

  isConfigured(): boolean {
    return Boolean(env.GEMINI_API_KEY?.trim());
  },
} as const;
