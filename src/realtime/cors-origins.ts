/**
 * Socket.IO and Express CORS origins derived from FRONTEND_URL.
 * Includes localhost ↔ 127.0.0.1 alias for local dev.
 */
export function resolveRealtimeCorsOrigins(frontendUrl: string): string[] {
  const normalized = frontendUrl.trim().replace(/\/$/, "");
  const origins = new Set<string>([normalized]);

  try {
    const url = new URL(normalized);
    const portSuffix = url.port ? `:${url.port}` : "";

    if (url.hostname === "localhost") {
      origins.add(`${url.protocol}//127.0.0.1${portSuffix}`);
    } else if (url.hostname === "127.0.0.1") {
      origins.add(`${url.protocol}//localhost${portSuffix}`);
    }
  } catch {
    // Invalid URL — return normalized only.
  }

  return [...origins];
}

export function isAllowedRealtimeOrigin(
  requestOrigin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!requestOrigin) {
    return false;
  }

  const normalized = requestOrigin.trim().replace(/\/$/, "");
  return allowedOrigins.some(
    (allowed) => allowed.trim().replace(/\/$/, "") === normalized,
  );
}
