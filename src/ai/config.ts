import { env } from "../config/env.js";

function parseFallbackChain(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const aiConfig = {
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
  geminiModelLite: env.GEMINI_MODEL_LITE,
  geminiModelStandard: env.GEMINI_MODEL_STANDARD ?? env.GEMINI_MODEL,
  geminiModelFallbackChain: parseFallbackChain(env.GEMINI_MODEL_FALLBACK),
  modelFallbackEnabled: env.AI_MODEL_FALLBACK_ENABLED,
  debounceMs: env.AI_DEBOUNCE_MS,
  logLlmPayloads: env.AI_LOG_LLM_PAYLOADS,
  persistExecutions: env.AI_PERSIST_EXECUTIONS,
  replyMaxChars: env.AI_REPLY_MAX_CHARS,
  maxBatchMessages: env.AI_MAX_BATCH_MESSAGES,
  observabilityEnabled: true,

  isConfigured(): boolean {
    return Boolean(env.GEMINI_API_KEY?.trim());
  },
} as const;
