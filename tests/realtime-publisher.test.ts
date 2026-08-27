import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNoopRealtimeAdapter,
  realtimePublisher,
} from "../src/realtime/index.js";
import type { RealtimeEvent } from "../src/realtime/types.js";

describe("realtimePublisher (Batch R1)", () => {
  beforeEach(() => {
    realtimePublisher.clear();
  });

  it("fans out events to registered adapters", async () => {
    const received: RealtimeEvent[] = [];
    realtimePublisher.register(
      createNoopRealtimeAdapter({
        onPublish: (event) => {
          received.push(event);
        },
      }),
    );

    const event: RealtimeEvent = {
      type: "message.created",
      threadId: "thread-1",
      message: {
        id: "msg-1",
        threadId: "thread-1",
        userId: "user-1",
        role: "user",
        content: "hello",
        attachmentIds: [],
        expenseIds: [],
        createdAt: new Date().toISOString(),
      },
    };

    await realtimePublisher.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("continues publishing when one adapter throws", async () => {
    const received: RealtimeEvent[] = [];
    realtimePublisher.register({
      name: "broken",
      publish() {
        throw new Error("boom");
      },
    });
    realtimePublisher.register(
      createNoopRealtimeAdapter({
        onPublish: (event) => {
          received.push(event);
        },
      }),
    );

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await realtimePublisher.publish({
      type: "message.created",
      threadId: "thread-1",
      message: {
        id: "msg-1",
        threadId: "thread-1",
        userId: "user-1",
        role: "user",
        content: "hello",
        attachmentIds: [],
        expenseIds: [],
        createdAt: new Date().toISOString(),
      },
    });

    expect(received).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
