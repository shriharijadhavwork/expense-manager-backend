import type { SafeMessage } from "../graph/state.js";
import type { ChatMessage } from "../types.js";

export function toChatMessages(messages: SafeMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role === "tool" ? "assistant" : message.role,
    content: message.content,
  }));
}

export function formatMessagesForPrompt(messages: SafeMessage[]): string {
  return messages
    .map(
      (message) =>
        `[id=${message.id}] ${message.role}: ${message.content}`,
    )
    .join("\n");
}
