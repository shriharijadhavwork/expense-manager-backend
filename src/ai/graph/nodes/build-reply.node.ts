import {
  fieldClarificationPrompt,
  isExpenseDraftComplete,
} from "../../utils/expense-draft.js";
import {
  formatExpenseList,
  formatSpendingSummary,
} from "../../utils/format-expense-results.js";
import type { FluxGraphState } from "../state.js";

export function buildReplyNode(state: FluxGraphState): Partial<FluxGraphState> {
  if (state.error) {
    return {
      assistantReply:
        "Something went wrong while processing your message. Please try again.",
    };
  }

  switch (state.intent) {
    case "create_expense": {
      if (state.createdExpense) {
        const expense = state.createdExpense;
        const note = expense.note ? ` (${expense.note})` : "";
        return {
          assistantReply: `Logged ${expense.formattedAmount} for ${expense.category}${note}.`,
        };
      }

      if (!isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)) {
        const field = state.missingFields[0] ?? "amount";
        return {
          assistantReply: fieldClarificationPrompt(field),
        };
      }

      return {
        assistantReply:
          "I have the expense details but could not save it. Please try again.",
      };
    }
    case "query_expenses": {
      if (state.spendingSummary) {
        return {
          assistantReply: formatSpendingSummary(state.spendingSummary),
        };
      }

      if (state.queryResult) {
        return {
          assistantReply: formatExpenseList(state.queryResult),
        };
      }

      return {
        assistantReply: "I couldn't look up your expenses. Please try again.",
      };
    }
    case "update_expense": {
      if (state.updatedExpense) {
        const expense = state.updatedExpense;
        const note = expense.note ? ` (${expense.note})` : "";
        return {
          assistantReply: `Updated — ${expense.formattedAmount} for ${expense.category}${note}.`,
        };
      }

      return {
        assistantReply:
          "I couldn't update that expense. Try being more specific about which one to change.",
      };
    }
    case "general_chat":
      return {
        assistantReply:
          "Hi! I'm FLUX. Tell me what you spent and I'll help you track it.",
      };
    case "clarification":
      return {
        assistantReply:
          "Thanks — let me use that to finish logging your expense.",
      };
    case "unknown":
    default:
      return {
        assistantReply:
          "I'm not sure I understood. You can tell me what you spent, for example: lunch was 450.",
      };
  }
}
