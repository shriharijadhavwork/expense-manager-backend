import { describe, expect, it } from "vitest";
import { createReplyGenerationSchema } from "../src/ai/schemas/reply-generation.schema.js";
import { sanitizeAssistantReply } from "../src/ai/utils/sanitize-assistant-reply.js";

describe("sanitizeAssistantReply (Batch C)", () => {
  it("trims and normalizes excessive blank lines", () => {
    expect(sanitizeAssistantReply("  Got it.\n\n\nSaved.  ")).toBe(
      "Got it.\n\nSaved.",
    );
  });

  it("returns null for empty or whitespace-only replies", () => {
    expect(sanitizeAssistantReply("   ")).toBeNull();
    expect(sanitizeAssistantReply(null)).toBeNull();
  });

  it("strips null bytes", () => {
    expect(sanitizeAssistantReply("Hello\u0000there")).toBe("Hellothere");
  });
});

describe("createReplyGenerationSchema (Batch C)", () => {
  it("rejects replies over the configured max length", () => {
    const schema = createReplyGenerationSchema(100);
    const result = schema.safeParse({ reply: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts replies within the configured max length", () => {
    const schema = createReplyGenerationSchema(100);
    const result = schema.safeParse({ reply: "Saved your expense." });
    expect(result.success).toBe(true);
  });
});
