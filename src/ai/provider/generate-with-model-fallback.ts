import { isRetryableLlmError } from "../utils/is-retryable-llm-error.js";
import { getModelCandidates } from "./model-registry.js";

export type ModelAttempt<T> = {
  model: string;
  attemptNumber: number;
  durationMs: number;
  status: "success" | "failed";
  error?: string;
  result?: T;
};

export type GenerateWithModelFallbackInput<T> = {
  callSite: string;
  excludedModels?: string[];
  invoke: (modelName: string) => Promise<T>;
  onModelFailure?: (details: {
    model: string;
    attemptNumber: number;
    durationMs: number;
    error: unknown;
  }) => void | Promise<void>;
};

export type GenerateWithModelFallbackResult<T> = {
  result: T;
  modelUsed: string;
  attempts: ModelAttempt<T>[];
};

export async function generateWithModelFallback<T>(
  input: GenerateWithModelFallbackInput<T>,
): Promise<GenerateWithModelFallbackResult<T>> {
  const candidates = getModelCandidates(
    input.callSite,
    input.excludedModels ?? [],
  );

  if (candidates.length === 0) {
    throw new Error("No Gemini models configured for fallback");
  }

  const attempts: ModelAttempt<T>[] = [];
  let lastError: unknown;

  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index]!;
    const attemptNumber = index + 1;
    const startedAt = Date.now();

    try {
      const result = await input.invoke(model);
      const durationMs = Date.now() - startedAt;

      attempts.push({
        model,
        attemptNumber,
        durationMs,
        status: "success",
        result,
      });

      return { result, modelUsed: model, attempts };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      lastError = error;

      attempts.push({
        model,
        attemptNumber,
        durationMs,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });

      await input.onModelFailure?.({
        model,
        attemptNumber,
        durationMs,
        error,
      });

      const hasNextModel = index < candidates.length - 1;
      if (!hasNextModel || !isRetryableLlmError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini model attempts failed");
}
