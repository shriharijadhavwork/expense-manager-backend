import type { SafeExpense } from "../../../services/expense.service.js";
import { createExpenseTool } from "../../tools/create-expense.tool.js";
import { isExpenseDraftComplete } from "../../utils/expense-draft.js";
import {
  getCreatableExtractedExpenses,
  type ExtractedExpenseItem,
} from "../../utils/normalize-extracted-expenses.js";
import type { FluxGraphState } from "../state.js";

function resolveItemsToCreate(state: FluxGraphState): ExtractedExpenseItem[] {
  const fromExtracted = getCreatableExtractedExpenses(state.extractedExpenses);
  if (fromExtracted.length > 0) {
    return fromExtracted;
  }

  if (!isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)) {
    return [];
  }

  const sourceMessageId =
    state.sourceMessageId ?? state.messageBatch.at(-1)?.id;

  if (!sourceMessageId) {
    return [];
  }

  return [
    {
      draft: state.expenseDraft!,
      sourceMessageId,
      missingFields: [],
    },
  ];
}

export async function createExpenseNode(
  state: FluxGraphState,
): Promise<Partial<FluxGraphState>> {
  if (state.error || state.intent !== "create_expense") {
    return {};
  }

  const itemsToCreate = resolveItemsToCreate(state);
  if (itemsToCreate.length === 0) {
    return {};
  }

  const createdExpenses: SafeExpense[] = [];
  let lastError: unknown;

  for (const item of itemsToCreate) {
    try {
      const expense = await createExpenseTool(
        {
          userId: state.userId,
          threadId: state.threadId,
          messageId: item.sourceMessageId,
        },
        item.draft,
        state.defaultCurrency,
      );
      createdExpenses.push(expense);
    } catch (error) {
      lastError = error;
      console.error("[ai] createExpenseTool failed", error);
    }
  }

  if (createdExpenses.length === 0) {
    return { error: "Could not create expense from chat message" };
  }

  if (createdExpenses.length < itemsToCreate.length && lastError) {
    console.warn("[ai] partial expense creation", {
      attempted: itemsToCreate.length,
      created: createdExpenses.length,
    });
  }

  return {
    createdExpenses,
    createdExpense: createdExpenses[0],
  };
}
