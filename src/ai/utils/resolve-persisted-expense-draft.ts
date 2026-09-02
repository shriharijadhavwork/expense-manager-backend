import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import { isExpenseDraftComplete } from "./expense-draft.js";
import type { ExtractedExpenseItem } from "./normalize-extracted-expenses.js";

export type PersistedExpenseDraftResolution = {
  draft: ExpenseDraft;
  missingFields: string[];
};

export function resolvePersistedExpenseDraft(input: {
  intent?: string;
  defaultCurrency: string;
  expenseDraft?: ExpenseDraft;
  missingFields: string[];
  extractedExpenses?: ExtractedExpenseItem[];
  createdExpensesCount: number;
}): PersistedExpenseDraftResolution | null {
  if (input.intent !== "create_expense") {
    return null;
  }

  const incompleteExtracted = input.extractedExpenses?.find(
    (item) => item.missingFields.length > 0,
  );

  if (incompleteExtracted) {
    return {
      draft: incompleteExtracted.draft,
      missingFields: incompleteExtracted.missingFields,
    };
  }

  if (
    input.createdExpensesCount === 0 &&
    !isExpenseDraftComplete(input.expenseDraft, input.defaultCurrency)
  ) {
    return {
      draft: input.expenseDraft ?? {},
      missingFields: input.missingFields,
    };
  }

  return null;
}
