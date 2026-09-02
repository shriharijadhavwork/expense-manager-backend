const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|apikey|api_key|credential|jwt)/i;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 6) {
    return "[truncated]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(record)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }

      sanitized[key] = sanitizeValue(entry, depth + 1);
    }

    return sanitized;
  }

  if (typeof value === "string" && value.length > 4000) {
    return `${value.slice(0, 4000)}…[truncated]`;
  }

  return value;
}

export function sanitizeLogPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }

  const sanitized = sanitizeValue(payload, 0);
  return typeof sanitized === "object" && sanitized !== null && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : { value: sanitized };
}
