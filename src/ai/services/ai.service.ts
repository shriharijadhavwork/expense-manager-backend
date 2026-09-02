import { z } from "zod";
import { ApiError } from "../../utils/api-error.js";
import { aiConfig } from "../config.js";
import { createLlmProvider } from "../provider/create-llm-provider.js";
import type { LlmProvider } from "../types.js";

const pingResponseSchema = z.object({
  status: z.literal("ok"),
});

export type AiHealthStatus = {
  configured: boolean;
  provider: string | null;
  model: string;
  debounceMs: number;
};

export type AiPingResult = {
  ok: true;
  model: string;
  latencyMs: number;
};

let providerOverride: LlmProvider | null = null;
let defaultProvider: LlmProvider | null = null;

function resolveProvider(): LlmProvider | null {
  if (providerOverride) {
    return providerOverride;
  }

  if (!aiConfig.isConfigured()) {
    return null;
  }

  if (!defaultProvider) {
    defaultProvider = createLlmProvider();
  }

  return defaultProvider;
}

export const aiService = {
  getHealthStatus(): AiHealthStatus {
    const configured = aiConfig.isConfigured() || providerOverride !== null;

    return {
      configured,
      provider: configured
        ? (providerOverride?.name ?? "gemini")
        : null,
      model: aiConfig.geminiModel,
      debounceMs: aiConfig.debounceMs,
    };
  },

  async ping(): Promise<AiPingResult> {
    const provider = resolveProvider();

    if (!provider) {
      throw new ApiError(
        503,
        "INTERNAL_ERROR",
        "AI provider is not configured. Set GEMINI_API_KEY in .env",
      );
    }

    const startedAt = Date.now();

    await provider.generateStructured({
      system:
        "You are a health-check endpoint. Reply with JSON only: {\"status\":\"ok\"}.",
      messages: [{ role: "user", content: "ping" }],
      schema: pingResponseSchema,
    });

    return {
      ok: true,
      model: aiConfig.geminiModel,
      latencyMs: Date.now() - startedAt,
    };
  },

  getProviderOrNull(): LlmProvider | null {
    return resolveProvider();
  },

  getProvider(): LlmProvider {
    const provider = resolveProvider();
    if (!provider) {
      throw new ApiError(
        503,
        "INTERNAL_ERROR",
        "AI provider is not configured. Set GEMINI_API_KEY in .env",
      );
    }
    return provider;
  },

  /** Test helper — inject a mock provider. Pass `null` to clear the override. */
  setProvider(provider: LlmProvider | null): void {
    providerOverride = provider;
  },

  /** Drop cached default provider (e.g. after env change in tests). */
  resetDefaultProvider(): void {
    defaultProvider = null;
  },
};
