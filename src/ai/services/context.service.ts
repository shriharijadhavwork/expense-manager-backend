import { DEFAULT_CURRENCY } from "../../constants/currency.js";
import { messageRepository } from "../../repositories/message.repository.js";
import { userPreferencesRepository } from "../../repositories/user-preferences.repository.js";
import { threadService } from "../../services/thread.service.js";
import type { FluxGraphInput, SafeMessage } from "../graph/state.js";
import type { SafeConversationAiState } from "../types/conversation-ai-state.js";

const RECENT_MESSAGE_LIMIT = 20;

export type BuildGraphContextInput = {
  userId: string;
  threadId: string;
  messageBatch: Array<{ id: string; content: string }>;
  aiState?: SafeConversationAiState;
};

function toSafeMessage(message: {
  _id: { toString(): string };
  role: SafeMessage["role"];
  content: string;
  createdAt?: Date;
}): SafeMessage {
  return {
    id: message._id.toString(),
    role: message.role,
    content: message.content,
    ...(message.createdAt
      ? { createdAt: message.createdAt.toISOString() }
      : {}),
  };
}

async function enrichMessageBatch(
  threadId: string,
  messageBatch: Array<{ id: string; content: string }>,
): Promise<SafeMessage[]> {
  return Promise.all(
    messageBatch.map(async (message) => {
      const document = await messageRepository.findByIdInThread(
        message.id,
        threadId,
      );

      return {
        id: message.id,
        role: "user" as const,
        content: message.content,
        ...(document?.createdAt
          ? { createdAt: document.createdAt.toISOString() }
          : {}),
      };
    }),
  );
}

export const contextService = {
  async buildGraphContext(
    input: BuildGraphContextInput,
  ): Promise<FluxGraphInput> {
    const thread = await threadService.requireAccessibleThread(
      input.userId,
      input.threadId,
    );

    const [preferences, recentDocs] = await Promise.all([
      userPreferencesRepository.getOrCreateForUser(input.userId),
      thread.type === "group"
        ? messageRepository.listAllByThread(input.threadId, {
            limit: RECENT_MESSAGE_LIMIT,
          })
        : messageRepository.listByThread(input.threadId, input.userId, {
            limit: RECENT_MESSAGE_LIMIT,
          }),
    ]);

    const recentMessages = recentDocs
      .slice()
      .reverse()
      .map(toSafeMessage);

    const messageBatch = await enrichMessageBatch(
      input.threadId,
      input.messageBatch,
    );

    return {
      threadId: input.threadId,
      userId: input.userId,
      defaultCurrency: preferences.defaultCurrency ?? DEFAULT_CURRENCY,
      messageBatch,
      recentMessages,
      ...(input.aiState?.expenseDraft
        ? { persistedExpenseDraft: input.aiState.expenseDraft }
        : {}),
      ...(input.aiState?.currentIntent
        ? { currentIntent: input.aiState.currentIntent }
        : {}),
    };
  },
};
