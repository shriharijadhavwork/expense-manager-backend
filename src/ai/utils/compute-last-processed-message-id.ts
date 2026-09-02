import type { SafeExpense } from "../../services/expense.service.js";
import type { ExtractedExpenseItem } from "./normalize-extracted-expenses.js";

export type MessageBatchItem = {
  id: string;
  content: string;
};

function normalizeContent(content: string): string {
  return content.trim().toLowerCase();
}

function isDuplicateOfHandledMessage(
  message: MessageBatchItem,
  earlierMessages: MessageBatchItem[],
  handledIds: Set<string>,
): boolean {
  const normalized = normalizeContent(message.content);
  return earlierMessages.some(
    (earlier) =>
      handledIds.has(earlier.id) &&
      normalizeContent(earlier.content) === normalized,
  );
}

function expenseMatchesExtractedItem(
  created: SafeExpense,
  item: ExtractedExpenseItem,
): boolean {
  return (
    created.sourceMessageId === item.sourceMessageId &&
    created.amount === item.draft.amount &&
    created.category === item.draft.category
  );
}

function isExpenseMessageHandled(input: {
  message: MessageBatchItem;
  earlierMessages: MessageBatchItem[];
  handledIds: Set<string>;
  skippedMessageIds: Set<string>;
  extractedExpenses: ExtractedExpenseItem[];
  createdExpenses: SafeExpense[];
}): boolean {
  if (input.skippedMessageIds.has(input.message.id)) {
    return true;
  }

  const extractedForMessage = input.extractedExpenses.filter(
    (item) => item.sourceMessageId === input.message.id,
  );

  if (extractedForMessage.length > 0) {
    const needsClarification = extractedForMessage.some(
      (item) => item.missingFields.length > 0,
    );

    if (needsClarification) {
      return true;
    }

    return extractedForMessage.every((item) =>
      input.createdExpenses.some((created) =>
        expenseMatchesExtractedItem(created, item),
      ),
    );
  }

  return isDuplicateOfHandledMessage(
    input.message,
    input.earlierMessages,
    input.handledIds,
  );
}

export function computeLastProcessedMessageId(input: {
  intent?: string;
  messageBatch: MessageBatchItem[];
  skippedMessageIds?: string[];
  extractedExpenses?: ExtractedExpenseItem[];
  createdExpenses?: SafeExpense[];
}): string | null {
  if (input.messageBatch.length === 0) {
    return null;
  }

  if (input.intent !== "create_expense") {
    return input.messageBatch.at(-1)?.id ?? null;
  }

  const skippedMessageIds = new Set(input.skippedMessageIds ?? []);
  const extractedExpenses = input.extractedExpenses ?? [];
  const createdExpenses = input.createdExpenses ?? [];
  const handledIds = new Set<string>();

  for (let index = 0; index < input.messageBatch.length; index += 1) {
    const message = input.messageBatch[index]!;
    const earlierMessages = input.messageBatch.slice(0, index);

    if (
      isExpenseMessageHandled({
        message,
        earlierMessages,
        handledIds,
        skippedMessageIds,
        extractedExpenses,
        createdExpenses,
      })
    ) {
      handledIds.add(message.id);
      continue;
    }

    break;
  }

  const handledMessages = input.messageBatch.filter((message) =>
    handledIds.has(message.id),
  );

  return handledMessages.at(-1)?.id ?? null;
}
