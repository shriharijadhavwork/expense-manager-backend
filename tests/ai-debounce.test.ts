import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai/config.js", () => ({
  aiConfig: {
    debounceMs: 100,
    isConfigured: () => true,
  },
}));

const processTurnMock = vi.fn();

vi.mock("../src/ai/services/orchestrator.service.js", () => ({
  orchestratorService: {
    processTurn: (...args: unknown[]) => processTurnMock(...args),
  },
}));

const { aiDebounceService } = await import(
  "../src/ai/services/debounce.service.js"
);

describe("aiDebounceService (Batch 4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    aiDebounceService.clearAll();
    processTurnMock.mockReset();
    processTurnMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    aiDebounceService.clearAll();
    vi.useRealTimers();
  });

  it("aggregates rapid user messages into one pending turn", () => {
    aiDebounceService.scheduleUserMessage({
      threadId: "thread-1",
      userId: "user-1",
      messageId: "msg-1",
      content: "Spent 100",
    });
    aiDebounceService.scheduleUserMessage({
      threadId: "thread-1",
      userId: "user-1",
      messageId: "msg-2",
      content: "on coffee",
    });

    const pending = aiDebounceService.getPendingTurn("thread-1");
    expect(pending?.messages).toHaveLength(2);
    expect(processTurnMock).not.toHaveBeenCalled();
  });

  it("runs the orchestrator after the debounce window", async () => {
    aiDebounceService.scheduleUserMessage({
      threadId: "thread-1",
      userId: "user-1",
      messageId: "msg-1",
      content: "Lunch was 450",
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(processTurnMock).toHaveBeenCalledOnce();
    expect(processTurnMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      userId: "user-1",
      messageBatch: [{ id: "msg-1", content: "Lunch was 450" }],
    });
  });

  it("resets the timer when another message arrives", async () => {
    aiDebounceService.scheduleUserMessage({
      threadId: "thread-1",
      userId: "user-1",
      messageId: "msg-1",
      content: "First",
    });

    await vi.advanceTimersByTimeAsync(60);

    aiDebounceService.scheduleUserMessage({
      threadId: "thread-1",
      userId: "user-1",
      messageId: "msg-2",
      content: "Second",
    });

    await vi.advanceTimersByTimeAsync(60);
    expect(processTurnMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(40);
    expect(processTurnMock).toHaveBeenCalledOnce();
    expect(processTurnMock.mock.calls[0]?.[0]).toMatchObject({
      messageBatch: [
        { id: "msg-1", content: "First" },
        { id: "msg-2", content: "Second" },
      ],
    });
  });
});
