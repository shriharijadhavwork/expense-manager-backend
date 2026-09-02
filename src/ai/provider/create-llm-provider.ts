import { aiConfig } from "../config.js";
import type { LlmProvider } from "../types.js";
import { GeminiProvider } from "./gemini.provider.js";

export function createLlmProvider(): LlmProvider {
  if (!aiConfig.isConfigured()) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GeminiProvider(
    aiConfig.geminiApiKey!,
    aiConfig.geminiModel,
  );
}
