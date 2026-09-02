import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiError } from "../../utils/api-error.js";
import { aiConfig } from "../config.js";
import { aiLogger } from "../observability/ai-logger.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import type {
  ChatMessage,
  GenerateStructuredInput,
  LlmProvider,
} from "../types.js";

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

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generateStructured<T>(
    input: GenerateStructuredInput<T>,
  ): Promise<T> {
    const callSite = input.callSite ?? "unknown";
    const model = this.client.getGenerativeModel({
      model: this.modelName,
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
    let responseText: string;

    try {
      const result = await model.generateContent({ contents });
      const durationMs = Date.now() - startedAt;
      responseText = result.response.text();
      const usage = result.response.usageMetadata;

      aiExecutionService.recordLlmCall({
        callSite,
        model: this.modelName,
        provider: this.name,
        durationMs,
        promptTokens: usage?.promptTokenCount,
        completionTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        status: "success",
      });
    } catch (error) {
      aiExecutionService.recordLlmCall({
        callSite,
        model: this.modelName,
        provider: this.name,
        durationMs: Date.now() - startedAt,
        status: "failed",
        error: getErrorMessage(error),
      });
      aiLogger.error("ai_llm_request_failed", {
        callSite,
        model: this.modelName,
        provider: this.name,
        error: getErrorMessage(error),
      });
      throw ApiError.internal("LLM request failed");
    }

    if (aiConfig.logLlmPayloads) {
      aiLogger.debug("ai_llm_raw_response", {
        callSite,
        model: this.modelName,
        responseText,
      });
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(responseText);
      if (aiConfig.logLlmPayloads) {
        aiLogger.debug("ai_llm_parsed_response", {
          callSite,
          model: this.modelName,
          parsed,
        });
      }
    } catch {
      aiLogger.error("ai_llm_invalid_json", {
        callSite,
        model: this.modelName,
      });
      throw ApiError.internal("LLM returned invalid JSON");
    }

    const validated = input.schema.safeParse(parsed);

    if (!validated.success) {
      aiLogger.error("ai_llm_schema_validation_failed", {
        callSite,
        model: this.modelName,
        fieldErrors: validated.error.flatten().fieldErrors,
        formErrors: validated.error.flatten().formErrors,
      });
      throw ApiError.internal("LLM response failed validation");
    }

    return validated.data;
  }
}
