export function parseHttpStatusFromError(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const enriched = error as Error & { status?: number; statusCode?: number };
  if (typeof enriched.status === "number") {
    return enriched.status;
  }
  if (typeof enriched.statusCode === "number") {
    return enriched.statusCode;
  }

  const bracketMatch = error.message.match(/\[(429|500|502|503|504)\s/i);
  if (bracketMatch?.[1]) {
    return Number.parseInt(bracketMatch[1], 10);
  }

  return undefined;
}

export function classifyLlmErrorCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const status = parseHttpStatusFromError(error);

  if (status === 429 || message.includes("rate limit") || message.includes("quota")) {
    return "RATE_LIMIT";
  }
  if (
    status === 503 ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("unavailable")
  ) {
    return "MODEL_OVERLOADED";
  }
  if (status === 404 || message.includes("not found") || message.includes("no longer available")) {
    return "MODEL_NOT_FOUND";
  }
  if (status === 401 || status === 403 || message.includes("api key")) {
    return "AUTH_ERROR";
  }
  if (status === 502 || status === 504 || message.includes("timeout")) {
    return "UPSTREAM_ERROR";
  }
  if (status === 500) {
    return "SERVER_ERROR";
  }

  return "LLM_ERROR";
}
