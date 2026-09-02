import {
  fieldClarificationPrompt,
  isExpenseDraftComplete,
} from "./expense-draft.js";
import {
  formatCreatedExpensesReply,
  getCreatedExpenses,
} from "./format-created-expenses-reply.js";
import {
  formatExpenseList,
  formatSpendingSummary,
} from "./format-expense-results.js";
import type { FluxGraphState } from "../graph/state.js";

/** Deterministic replies used when LLM generation is skipped or fails. */
export function buildDeterministicReply(state: FluxGraphState): string {
  if (state.error) {
    return "Something went wrong while processing your message. Please try again.";
  }

  switch (state.intent) {
    case "create_expense": {
      const createdExpenses = getCreatedExpenses(state);
      if (createdExpenses.length > 0) {
        return formatCreatedExpensesReply(createdExpenses);
      }

      if (!isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)) {
        const field = state.missingFields[0] ?? "amount";
        return fieldClarificationPrompt(field);
      }

      return "I have the expense details but could not save it. Please try again.";
    }
    case "query_expenses": {
      if (state.spendingSummary) {
        return formatSpendingSummary(state.spendingSummary);
      }

      if (state.queryResult) {
        return formatExpenseList(state.queryResult);
      }

      return "I couldn't look up your expenses. Please try again.";
    }
    case "update_expense": {
      if (state.updatedExpense) {
        const expense = state.updatedExpense;
        const note = expense.note ? ` (${expense.note})` : "";
        return `Updated — ${expense.formattedAmount} for ${expense.categoryLabel}${note}.`;
      }

      return "I couldn't update that expense. Try being more specific about which one to change.";
    }
    case "general_chat":
      return "Hi! I'm FLUX. Tell me what you spent and I'll help you track it.";
    case "clarification":
      return "Thanks — let me use that to finish logging your expense.";
    case "unknown":
    default:
      return "I'm not sure I understood. You can tell me what you spent, for example: lunch was 450.";
  }
}
