/** Normalize and validate LLM assistant reply text before persisting. */
export function sanitizeAssistantReply(
  value: string | undefined | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > 0 ? normalized : null;
}
