import { describe, expect, it } from "vitest";
import { capMessageBatch } from "../src/ai/utils/cap-message-batch.js";
import { formatMessagesForPrompt } from "../src/ai/utils/format-messages.js";

describe("capMessageBatch", () => {
  it("returns all messages when under the cap", () => {
    const messages = [
      { id: "1", content: "a" },
      { id: "2", content: "b" },
    ];

    const result = capMessageBatch(messages, 10);

    expect(result.batch).toEqual(messages);
    expect(result.truncated).toBe(false);
    expect(result.droppedCount).toBe(0);
  });

  it("keeps the first N messages when over the cap", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      id: `msg-${index + 1}`,
      content: `message ${index + 1}`,
    }));

    const result = capMessageBatch(messages, 10);

    expect(result.batch).toHaveLength(10);
    expect(result.batch[0]?.id).toBe("msg-1");
    expect(result.batch[9]?.id).toBe("msg-10");
    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(12);
    expect(result.droppedCount).toBe(2);
  });
});

describe("formatMessagesForPrompt", () => {
  it("includes message ids for LLM source mapping", () => {
    const formatted = formatMessagesForPrompt([
      {
        id: "507f1f77bcf86cd799439013",
        role: "user",
        content: "Spent 450 on lunch",
      },
      {
        id: "507f1f77bcf86cd799439014",
        role: "assistant",
        content: "Noted.",
      },
    ]);

    expect(formatted).toBe(
      [
        "[id=507f1f77bcf86cd799439013] user: Spent 450 on lunch",
        "[id=507f1f77bcf86cd799439014] assistant: Noted.",
      ].join("\n"),
    );
  });
});

describe("conversationAiStateService.resolveMessageBatch cap", () => {
  it("caps debounced messages to AI_MAX_BATCH_MESSAGES", async () => {
    process.env["AI_MAX_BATCH_MESSAGES"] = "10";

    const { conversationAiStateService } = await import(
      "../src/ai/services/conversation-ai-state.service.js"
    );

    const debouncedMessages = Array.from({ length: 12 }, (_, index) => ({
      id: `msg-${index + 1}`,
      content: `message ${index + 1}`,
    }));

    const batch = await conversationAiStateService.resolveMessageBatch({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      debouncedMessages,
    });

    expect(batch).toHaveLength(10);
    expect(batch[0]?.id).toBe("msg-1");
    expect(batch[9]?.id).toBe("msg-10");
  });
});
