import {
  classifyLlmErrorCode,
  parseHttpStatusFromError,
} from "./parse-llm-error-code.js";

const RETRYABLE_ERROR_CODES = new Set([
  "RATE_LIMIT",
  "MODEL_OVERLOADED",
  "MODEL_NOT_FOUND",
  "UPSTREAM_ERROR",
  "SERVER_ERROR",
]);

export function isRetryableLlmError(error: unknown): boolean {
  const code = classifyLlmErrorCode(error);
  if (RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const status = parseHttpStatusFromError(error);
  return status !== undefined && [429, 500, 502, 503, 504].includes(status);
}
