function serializeUnknown(value: unknown, depth: number): unknown {
  if (depth > 5) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    return serializeError(value, depth + 1);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeUnknown(entry, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const serialized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    serialized[key] = serializeUnknown(entry, depth + 1);
  }

  return serialized;
}

export function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: String(error),
      value: serializeUnknown(error, depth + 1),
    };
  }

  const payload: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    payload["stack"] = error.stack;
  }

  const enriched = error as Error & {
    status?: number;
    statusCode?: number;
    code?: string;
    cause?: unknown;
  };

  if (enriched.status !== undefined) {
    payload["status"] = enriched.status;
  }
  if (enriched.statusCode !== undefined) {
    payload["statusCode"] = enriched.statusCode;
  }
  if (enriched.code !== undefined) {
    payload["code"] = enriched.code;
  }
  if (enriched.cause !== undefined) {
    payload["cause"] = serializeUnknown(enriched.cause, depth + 1);
  }

  return payload;
}
