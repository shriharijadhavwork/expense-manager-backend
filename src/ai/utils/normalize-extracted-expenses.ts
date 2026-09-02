import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import type { ExpenseExtractionsResult } from "../schemas/expense-extractions.schema.js";
import type { SafeMessage } from "../graph/state.js";
import {
  applyExpenseDefaults,
  getMissingExpenseFields,
  isExpenseDraftComplete,
  type RequiredExpenseField,
} from "./expense-draft.js";
import { getReferenceDateForMessage } from "./message-reference-time.js";

export type ExtractedExpenseItem = {
  draft: ExpenseDraft;
  sourceMessageId: string;
  missingFields: RequiredExpenseField[];
};

export type NormalizeExtractedExpensesInput = {
  raw: ExpenseExtractionsResult;
  messageBatch: SafeMessage[];
  defaultCurrency: string;
  persistedExpenseDraft?: ExpenseDraft;
};

export type NormalizeExtractedExpensesResult = {
  items: ExtractedExpenseItem[];
  skippedMessageIds: string[];
};

function buildBatchIdSet(messageBatch: SafeMessage[]): Set<string> {
  return new Set(messageBatch.map((message) => message.id));
}

function resolveSourceMessageId(input: {
  candidateId: string | undefined;
  draft: ExpenseDraft;
  messageBatch: SafeMessage[];
  batchIds: Set<string>;
}): string {
  if (input.candidateId && input.batchIds.has(input.candidateId)) {
    return input.candidateId;
  }

  const amountToken =
    input.draft.amount !== undefined ? String(input.draft.amount) : undefined;
  const noteToken = input.draft.note?.trim().toLowerCase();

  for (const message of input.messageBatch) {
    const content = message.content.toLowerCase();
    if (amountToken && content.includes(amountToken)) {
      return message.id;
    }
    if (noteToken && noteToken.length > 2 && content.includes(noteToken)) {
      return message.id;
    }
  }

  const lastUserMessage = [...input.messageBatch]
    .reverse()
    .find((message) => message.role === "user");

  if (lastUserMessage) {
    return lastUserMessage.id;
  }

  return input.messageBatch.at(-1)?.id ?? "";
}

function buildDedupeKey(item: ExtractedExpenseItem): string {
  return [
    item.draft.amount ?? "",
    item.draft.category?.toLowerCase() ?? "",
    item.draft.subCategory?.trim().toLowerCase() ?? "",
    item.draft.direction ?? "debit",
    item.draft.note?.trim().toLowerCase() ?? "",
    item.draft.date ?? "",
  ].join("|");
}

function dedupeExtractedExpenses(
  items: ExtractedExpenseItem[],
): ExtractedExpenseItem[] {
  const seen = new Set<string>();
  const deduped: ExtractedExpenseItem[] = [];

  for (const item of items) {
    const key = buildDedupeKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function normalizeExtractedExpenses(
  input: NormalizeExtractedExpensesInput,
): NormalizeExtractedExpensesResult {
  const batchIds = buildBatchIdSet(input.messageBatch);
  const skippedMessageIds = input.raw.skippedMessageIds.filter((messageId) =>
    batchIds.has(messageId),
  );

  let rawExpenses = input.raw.expenses;

  if (rawExpenses.length === 0 && input.persistedExpenseDraft) {
    rawExpenses = [
      {
        expenseDraft: input.persistedExpenseDraft,
      },
    ];
  }

  const items = rawExpenses
    .map((rawItem, index) => {
      const mergedDraft: ExpenseDraft = {
        ...(input.persistedExpenseDraft && index === 0 && rawExpenses.length === 1
          ? input.persistedExpenseDraft
          : {}),
        ...rawItem.expenseDraft,
      };

      const sourceMessageId = resolveSourceMessageId({
        candidateId: rawItem.sourceMessageId,
        draft: mergedDraft,
        messageBatch: input.messageBatch,
        batchIds,
      });

      if (!sourceMessageId) {
        return null;
      }

      const sourceMessage = input.messageBatch.find(
        (message) => message.id === sourceMessageId,
      );

      const draft = applyExpenseDefaults({
        draft: mergedDraft,
        defaultCurrency: input.defaultCurrency,
        referenceAt: getReferenceDateForMessage(
          sourceMessage,
          input.messageBatch,
        ),
        dateHint: rawItem.dateHint,
        messageText: sourceMessage?.content ?? "",
      });

      const missingFields = getMissingExpenseFields(draft);

      return {
        draft,
        sourceMessageId,
        missingFields,
      } satisfies ExtractedExpenseItem;
    })
    .filter((item): item is ExtractedExpenseItem => item !== null);

  return {
    items: dedupeExtractedExpenses(items),
    skippedMessageIds,
  };
}

export function getCreatableExtractedExpenses(
  items: ExtractedExpenseItem[],
): ExtractedExpenseItem[] {
  return items.filter((item) => item.missingFields.length === 0);
}

export function hasCreatableExtractedExpenses(input: {
  extractedExpenses: ExtractedExpenseItem[];
  expenseDraft: ExpenseDraft | undefined;
  defaultCurrency: string;
}): boolean {
  if (getCreatableExtractedExpenses(input.extractedExpenses).length > 0) {
    return true;
  }

  return isExpenseDraftComplete(input.expenseDraft, input.defaultCurrency);
}

export function pickPrimaryExtractedExpense(
  items: ExtractedExpenseItem[],
): ExtractedExpenseItem | undefined {
  return (
    items.find((item) => item.missingFields.length === 0) ??
    items[0]
  );
}
