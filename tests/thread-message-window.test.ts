import { describe, expect, it } from "vitest";
import {
  THREAD_MAX_USER_MESSAGES,
  THREAD_MESSAGE_WINDOW_MS,
  computeMessageWindowEndsAt,
} from "../src/config/thread.constants.js";
import {
  assertThreadAcceptsUserMessage,
  hasUserMessageCapacity,
  isThreadMessageWindowOpen,
} from "../src/utils/thread-message-window.js";

describe("thread message window", () => {
  it("computes window end as creation + 24 hours", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const endsAt = computeMessageWindowEndsAt(createdAt);

    expect(endsAt.getTime()).toBe(
      createdAt.getTime() + THREAD_MESSAGE_WINDOW_MS,
    );
  });

  it("allows messages before window end and under limit", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const thread = {
      messageWindowEndsAt: computeMessageWindowEndsAt(createdAt),
      userMessageCount: 0,
    };

    expect(
      isThreadMessageWindowOpen(thread, new Date("2026-01-01T20:00:00.000Z")),
    ).toBe(true);
    expect(hasUserMessageCapacity(thread)).toBe(true);
    expect(() =>
      assertThreadAcceptsUserMessage(
        thread,
        new Date("2026-01-01T20:00:00.000Z"),
      ),
    ).not.toThrow();
  });

  it("rejects messages after window end", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const thread = {
      messageWindowEndsAt: computeMessageWindowEndsAt(createdAt),
      userMessageCount: 1,
    };

    expect(() =>
      assertThreadAcceptsUserMessage(
        thread,
        new Date("2026-01-02T10:00:01.000Z"),
      ),
    ).toThrow(/conversation has closed/i);
  });

  it("rejects messages at user limit", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const thread = {
      messageWindowEndsAt: computeMessageWindowEndsAt(createdAt),
      userMessageCount: THREAD_MAX_USER_MESSAGES,
    };

    expect(() =>
      assertThreadAcceptsUserMessage(
        thread,
        new Date("2026-01-01T11:00:00.000Z"),
      ),
    ).toThrow(/100-message limit/i);
  });
});
