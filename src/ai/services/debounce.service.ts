import { aiConfig } from "../config.js";

export type PendingUserMessage = {
  id: string;
  content: string;
};

export type PendingTurn = {
  userId: string;
  messages: PendingUserMessage[];
};

const timers = new Map<string, NodeJS.Timeout>();
const pendingTurns = new Map<string, PendingTurn>();

export const aiDebounceService = {
  scheduleUserMessage(input: {
    threadId: string;
    userId: string;
    messageId: string;
    content: string;
  }): void {
    if (!aiConfig.isConfigured()) {
      return;
    }

    const existing = pendingTurns.get(input.threadId);
    const turn: PendingTurn = existing ?? {
      userId: input.userId,
      messages: [],
    };

    turn.userId = input.userId;
    turn.messages.push({
      id: input.messageId,
      content: input.content,
    });
    pendingTurns.set(input.threadId, turn);

    const existingTimer = timers.get(input.threadId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      timers.delete(input.threadId);
      const batch = pendingTurns.get(input.threadId);
      pendingTurns.delete(input.threadId);

      if (!batch || batch.messages.length === 0) {
        return;
      }

      void import("./orchestrator.service.js").then(({ orchestratorService }) =>
        orchestratorService.processTurn({
          threadId: input.threadId,
          userId: batch.userId,
          messageBatch: batch.messages,
        }),
      );
    }, aiConfig.debounceMs);

    timers.set(input.threadId, timer);
  },

  /** Test helper — immediately run any pending turn for a thread. */
  async flush(threadId: string): Promise<void> {
    const timer = timers.get(threadId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(threadId);
    }

    const batch = pendingTurns.get(threadId);
    pendingTurns.delete(threadId);

    if (!batch || batch.messages.length === 0) {
      return;
    }

    const { orchestratorService } = await import("./orchestrator.service.js");
    await orchestratorService.processTurn({
      threadId,
      userId: batch.userId,
      messageBatch: batch.messages,
    });
  },

  /** Test helper — cancel timers and clear pending batches. */
  clearAll(): void {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    pendingTurns.clear();
  },

  getPendingTurn(threadId: string): PendingTurn | undefined {
    return pendingTurns.get(threadId);
  },
};
