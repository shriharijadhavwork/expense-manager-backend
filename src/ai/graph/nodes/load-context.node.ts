import type { FluxGraphState } from "../state.js";

export function loadContextNode(state: FluxGraphState): Partial<FluxGraphState> {
  if (!state.messageBatch.length) {
    return { error: "Message batch is empty" };
  }

  const sourceMessageId = state.messageBatch.at(-1)?.id;

  return sourceMessageId ? { sourceMessageId } : {};
}
