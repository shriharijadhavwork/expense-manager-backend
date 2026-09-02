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
import { isExpenseDraftComplete } from "../utils/expense-draft.js";

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
    if (!input.lastProcessedMessageId) {
      return input.debouncedMessages;
    }

    const messages = await messageRepository.listUserMessagesAfter(
      input.threadId,
      input.lastProcessedMessageId,
    );

    if (messages.length > 0) {
      return messages.map((message) => ({
        id: String(message._id),
        content: message.content,
      }));
    }

    return input.debouncedMessages;
  },

  async recordSuccessfulTurn(input: {
    threadId: string;
    userId: string;
    aiState: SafeConversationAiState;
    messageBatch: Array<{ id: string }>;
    result: RecordTurnResult;
  }): Promise<SafeConversationAiState | null> {
    const lastMessageId = input.messageBatch.at(-1)?.id;
    if (!lastMessageId) {
      return null;
    }

    const expenseCreated = Boolean(input.result.createdExpense);
    const draftComplete = isExpenseDraftComplete(
      input.result.expenseDraft,
      input.result.defaultCurrency,
    );

    const shouldPersistDraft =
      input.result.intent === "create_expense" &&
      !expenseCreated &&
      !draftComplete;

    const updated = await conversationAiStateRepository.updateAfterTurn(
      input.threadId,
      {
        expectedVersion: input.aiState.version,
        userId: input.userId,
        lastProcessedMessageId: lastMessageId,
        currentIntent: shouldPersistDraft ? input.result.intent ?? null : null,
        expenseDraft: shouldPersistDraft
          ? (input.result.expenseDraft ?? null)
          : null,
        missingRequiredFields: shouldPersistDraft
          ? input.result.missingFields
          : null,
      },
    );

    return updated ? toSafeState(updated) : null;
  },
};
