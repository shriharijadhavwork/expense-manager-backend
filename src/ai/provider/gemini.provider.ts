import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiError } from "../../utils/api-error.js";
import { aiConfig } from "../config.js";
import { recordAiError } from "../observability/record-ai-error.js";
import { aiLogger } from "../observability/ai-logger.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import { classifyLlmErrorCode } from "../utils/parse-llm-error-code.js";
import type {
  ChatMessage,
  GenerateStructuredInput,
  LlmProvider,
} from "../types.js";
import { generateWithModelFallback } from "./generate-with-model-fallback.js";

function toGeminiRole(
  role: ChatMessage["role"],
): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type StructuredGeminiResult<T> = {
  data: T;
  modelUsed: string;
  responseText: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenerativeAI;
  private readonly defaultModelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.defaultModelName = modelName;
  }

  async generateStructured<T>(
    input: GenerateStructuredInput<T>,
  ): Promise<T> {
    const callSite = input.callSite ?? "unknown";

    const { result, modelUsed, attempts } =
      await generateWithModelFallback<StructuredGeminiResult<T>>({
        callSite,
        invoke: (modelName) =>
          this.invokeStructuredCall(modelName, input, callSite),
        onModelFailure: async ({ model, attemptNumber, durationMs, error }) => {
          aiExecutionService.recordLlmCall({
            callSite,
            model,
            provider: this.name,
            durationMs,
            attemptNumber,
            status: "failed",
            error: getErrorMessage(error),
          });

          recordAiError({
            model,
            callSite,
            error,
            errorCode: classifyLlmErrorCode(error),
            requestPayload: {
              callSite,
              attemptNumber,
              messageCount: input.messages.length,
            },
          });

          aiLogger.error("ai_llm_request_failed", {
            callSite,
            model,
            provider: this.name,
            attemptNumber,
            error: getErrorMessage(error),
          });
        },
      });

    const successAttempt = attempts.find((attempt) => attempt.status === "success");
    if (successAttempt?.result) {
      const usage = successAttempt.result;
      aiExecutionService.recordLlmCall({
        callSite,
        model: successAttempt.model,
        provider: this.name,
        durationMs: successAttempt.durationMs,
        attemptNumber: successAttempt.attemptNumber,
        ...(successAttempt.attemptNumber > 1
          ? {
              fallbackFrom: attempts
                .slice(0, successAttempt.attemptNumber - 1)
                .map((entry) => entry.model)
                .join(","),
            }
          : {}),
        ...(usage.promptTokens !== undefined
          ? { promptTokens: usage.promptTokens }
          : {}),
        ...(usage.completionTokens !== undefined
          ? { completionTokens: usage.completionTokens }
          : {}),
        ...(usage.totalTokens !== undefined
          ? { totalTokens: usage.totalTokens }
          : {}),
        status: "success",
      });
    }

    if (modelUsed !== this.defaultModelName) {
      aiLogger.info("ai_llm_model_fallback_success", {
        callSite,
        modelUsed,
        defaultModel: this.defaultModelName,
        attemptCount: attempts.length,
      });
    }

    return result.data;
  }

  private async invokeStructuredCall<T>(
    modelName: string,
    input: GenerateStructuredInput<T>,
    callSite: string,
  ): Promise<StructuredGeminiResult<T>> {
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: input.system,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const contents = input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: toGeminiRole(message.role),
        parts: [{ text: message.content }],
      }));

    const startedAt = Date.now();
    const result = await model.generateContent({ contents });
    const durationMs = Date.now() - startedAt;
    const responseText = result.response.text();
    const usage = result.response.usageMetadata;

    aiLogger.info("ai_llm_raw_response", {
      callSite,
      model: modelName,
      responseText,
    });

    let parsed: unknown;

    try {
      parsed = JSON.parse(responseText);
      if (aiConfig.logLlmPayloads) {
        aiLogger.debug("ai_llm_parsed_response", {
          callSite,
          model: modelName,
          parsed,
        });
      }
    } catch {
      aiLogger.error("ai_llm_invalid_json", {
        callSite,
        model: modelName,
        responseText,
      });
      throw ApiError.internal("LLM returned invalid JSON");
    }

    const validated = input.schema.safeParse(parsed);

    if (!validated.success) {
      aiLogger.error("ai_llm_schema_validation_failed", {
        callSite,
        model: modelName,
        responseText,
        parsed,
        fieldErrors: validated.error.flatten().fieldErrors,
        formErrors: validated.error.flatten().formErrors,
      });
      throw ApiError.internal("LLM response failed validation");
    }

    return {
      data: validated.data,
      modelUsed: modelName,
      responseText,
      durationMs,
      ...(usage?.promptTokenCount !== undefined
        ? { promptTokens: usage.promptTokenCount }
        : {}),
      ...(usage?.candidatesTokenCount !== undefined
        ? { completionTokens: usage.candidatesTokenCount }
        : {}),
      ...(usage?.totalTokenCount !== undefined
        ? { totalTokens: usage.totalTokenCount }
        : {}),
    };
  }
}
