import type { ConversationAiStateDocument } from "../../models/conversation-ai-state.model.js";
import type { ConversationExpenseDraft } from "../../models/conversation-ai-state.model.js";
import { conversationAiStateRepository } from "../../repositories/conversation-ai-state.repository.js";
import { messageRepository } from "../../repositories/message.repository.js";
import { threadService } from "../../services/thread.service.js";
import type { AgentIntent } from "../schemas/agent-output.schema.js";
import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import type {
  RecordTurnResult,
  SafeConversationAiState,
} from "../types/conversation-ai-state.js";
import { aiConfig } from "../config.js";
import { aiLogger } from "../observability/ai-logger.js";
import { capMessageBatch } from "../utils/cap-message-batch.js";
import { computeLastProcessedMessageId } from "../utils/compute-last-processed-message-id.js";
import { resolvePersistedExpenseDraft } from "../utils/resolve-persisted-expense-draft.js";
import { getCreatedExpenses } from "../utils/format-created-expenses-reply.js";

export type { SafeConversationAiState } from "../types/conversation-ai-state.js";

export type ResolveMessageBatchInput = {
  threadId: string;
  userId: string;
  debouncedMessages: Array<{ id: string; content: string }>;
  lastProcessedMessageId?: string;
};

function plainExpenseDraft(
  draft: ConversationExpenseDraft | undefined,
): ExpenseDraft | undefined {
  if (!draft) {
    return undefined;
  }

  return {
    ...(draft.amount !== undefined ? { amount: draft.amount } : {}),
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.note ? { note: draft.note } : {}),
    ...(draft.date ? { date: draft.date } : {}),
    ...(draft.currency ? { currency: draft.currency } : {}),
  };
}

function toSafeState(
  state: ConversationAiStateDocument,
): SafeConversationAiState {
  const expenseDraft = plainExpenseDraft(state.expenseDraft);

  return {
    threadId: String(state.threadId),
    userId: String(state.userId),
    ...(state.currentIntent
      ? { currentIntent: state.currentIntent as AgentIntent }
      : {}),
    ...(expenseDraft ? { expenseDraft } : {}),
    ...(state.missingRequiredFields
      ? { missingRequiredFields: state.missingRequiredFields }
      : {}),
    ...(state.lastProcessedMessageId
      ? { lastProcessedMessageId: String(state.lastProcessedMessageId) }
      : {}),
    ...(state.lastProcessedAt
      ? { lastProcessedAt: state.lastProcessedAt.toISOString() }
      : {}),
    ...(state.summary ? { summary: state.summary } : {}),
    version: state.version,
  };
}

function capResolvedMessageBatch<T extends { id: string; content: string }>(
  messages: T[],
  input: { threadId: string; maxBatchMessages: number },
): T[] {
  const capped = capMessageBatch(messages, input.maxBatchMessages);

  if (capped.truncated) {
    aiLogger.warn("ai_batch_truncated", {
      threadId: input.threadId,
      totalCount: capped.totalCount,
      processedCount: capped.batch.length,
      droppedCount: capped.droppedCount,
      maxBatchMessages: input.maxBatchMessages,
    });
  }

  return capped.batch;
}

export const conversationAiStateService = {
  async getOrCreate(
    threadId: string,
    userId: string,
  ): Promise<SafeConversationAiState> {
    await threadService.requireAccessibleThread(userId, threadId);
    const state = await conversationAiStateRepository.getOrCreateForThread(
      threadId,
      userId,
    );
    return toSafeState(state);
  },

  async resolveMessageBatch(
    input: ResolveMessageBatchInput,
  ): Promise<Array<{ id: string; content: string }>> {
    const maxBatchMessages = aiConfig.maxBatchMessages;

    if (!input.lastProcessedMessageId) {
      return capResolvedMessageBatch(input.debouncedMessages, {
        threadId: input.threadId,
        maxBatchMessages,
      });
    }

    const messages = await messageRepository.listUserMessagesAfter(
      input.threadId,
      input.lastProcessedMessageId,
      maxBatchMessages,
    );

    if (messages.length > 0) {
      return capResolvedMessageBatch(
        messages.map((message) => ({
          id: String(message._id),
          content: message.content,
        })),
        {
          threadId: input.threadId,
          maxBatchMessages,
        },
      );
    }

    return capResolvedMessageBatch(input.debouncedMessages, {
      threadId: input.threadId,
      maxBatchMessages,
    });
  },

  async recordSuccessfulTurn(input: {
    threadId: string;
    userId: string;
    aiState: SafeConversationAiState;
    messageBatch: Array<{ id: string; content: string }>;
    result: RecordTurnResult;
  }): Promise<SafeConversationAiState | null> {
    const computedLastProcessedMessageId = computeLastProcessedMessageId({
      intent: input.result.intent,
      messageBatch: input.messageBatch,
      skippedMessageIds: input.result.skippedMessageIds,
      extractedExpenses: input.result.extractedExpenses,
      createdExpenses: getCreatedExpenses(input.result),
    });

    const lastProcessedMessageId =
      computedLastProcessedMessageId ?? input.aiState.lastProcessedMessageId;

    if (!lastProcessedMessageId) {
      return null;
    }

    const persistedDraft = resolvePersistedExpenseDraft({
      intent: input.result.intent,
      defaultCurrency: input.result.defaultCurrency,
      expenseDraft: input.result.expenseDraft,
      missingFields: input.result.missingFields,
      extractedExpenses: input.result.extractedExpenses,
      createdExpensesCount: getCreatedExpenses(input.result).length,
    });

    const updated = await conversationAiStateRepository.updateAfterTurn(
      input.threadId,
      {
        expectedVersion: input.aiState.version,
        userId: input.userId,
        lastProcessedMessageId,
        currentIntent: persistedDraft ? input.result.intent ?? null : null,
        expenseDraft: persistedDraft ? persistedDraft.draft : null,
        missingRequiredFields: persistedDraft
          ? persistedDraft.missingFields
          : null,
      },
    );

    return updated ? toSafeState(updated) : null;
  },
};
