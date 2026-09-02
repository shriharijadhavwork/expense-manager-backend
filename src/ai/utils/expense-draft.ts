import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import { resolveExpenseDate } from "../tools/resolve-expense-date.tool.js";

/** Fields FLUX must ask the user for — date/currency are resolved automatically. */
const REQUIRED_USER_FIELDS = ["amount", "category"] as const;

export type RequiredExpenseField = "amount" | "category";

export type ApplyExpenseDefaultsInput = {
  draft: ExpenseDraft | undefined;
  defaultCurrency: string;
  referenceAt: Date;
  dateHint?: string;
  messageText?: string;
};

export function applyExpenseDefaults(
  input: ApplyExpenseDefaultsInput,
): ExpenseDraft {
  const currency = input.draft?.currency ?? input.defaultCurrency;
  const date = resolveExpenseDate({
    referenceAt: input.referenceAt,
    explicitDate: input.draft?.date,
    dateHint: input.dateHint,
    messageText: input.messageText,
  });

  return {
    ...input.draft,
    currency,
    date,
  };
}

export function getMissingExpenseFields(
  draft: ExpenseDraft | undefined,
): RequiredExpenseField[] {
  return REQUIRED_USER_FIELDS.filter((field) => {
    const value = draft?.[field];
    return value === undefined || value === null || value === "";
  });
}

export function isExpenseDraftComplete(
  draft: ExpenseDraft | undefined,
  _defaultCurrency?: string,
): boolean {
  return getMissingExpenseFields(draft).length === 0;
}

export function fieldClarificationPrompt(field: string): string {
  switch (field) {
    case "amount":
      return "How much was it?";
    case "category":
      return "What category should I use for this expense?";
    default:
      return `Could you share the ${field}?`;
  }
}
