import type {
  SafeExpense,
  SpendingSummary,
} from "../../services/expense.service.js";
import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import { getCreatableExtractedExpenses } from "./normalize-extracted-expenses.js";
import { getCreatedExpenses } from "./format-created-expenses-reply.js";
import { isExpenseDraftComplete } from "./expense-draft.js";
import type { FluxGraphState } from "../graph/state.js";

export type ReplyOutcome =
  | { outcome: "error"; message: string }
  | {
      outcome: "expense_created";
      expense: SerializedExpense;
    }
  | {
      outcome: "expenses_created";
      expenses: SerializedExpense[];
    }
  | {
      outcome: "needs_clarification";
      missingFields: string[];
      partialDraft?: Partial<ExpenseDraft>;
    }
  | { outcome: "expense_create_failed" }
  | {
      outcome: "query_summary";
      count: number;
      totals: Array<{
        currency: string;
        formattedAmount: string;
        amount: number;
      }>;
      byCategory: Array<{
        category: string;
        currency: string;
        formattedAmount: string;
        amount: number;
        count: number;
      }>;
      truncatedCategories: number;
    }
  | {
      outcome: "query_list";
      count: number;
      expenses: SerializedExpense[];
      truncated: boolean;
    }
  | { outcome: "query_failed" }
  | {
      outcome: "expense_updated";
      expense: SerializedExpense;
    }
  | { outcome: "update_failed" }
  | { outcome: "general_chat" }
  | { outcome: "clarification_ack" }
  | { outcome: "unknown_intent" };

export type SerializedExpense = {
  amount: number;
  formattedAmount: string;
  currency: string;
  category: string;
  note: string;
  date: string;
};

export type ReplyContextPayload = {
  intent: FluxGraphState["intent"];
  outcome: ReplyOutcome;
  recentUserMessage: string;
  instruction: string;
  useDeterministicReply: boolean;
};

const LIST_PREVIEW_LIMIT = 5;
const CATEGORY_PREVIEW_LIMIT = 5;

function serializeExpense(expense: SafeExpense): SerializedExpense {
  return {
    amount: expense.amount,
    formattedAmount: expense.formattedAmount,
    currency: expense.currency,
    category: expense.category,
    note: expense.note,
    date: expense.date,
  };
}

function serializeSpendingSummary(summary: SpendingSummary): ReplyOutcome {
  return {
    outcome: "query_summary",
    count: summary.count,
    totals: summary.totals.map((total) => ({
      currency: total.currency,
      formattedAmount: total.formattedAmount,
      amount: total.amount,
    })),
    byCategory: summary.byCategory.slice(0, CATEGORY_PREVIEW_LIMIT).map((row) => ({
      category: row.category,
      currency: row.currency,
      formattedAmount: row.formattedAmount,
      amount: row.amount,
      count: row.count,
    })),
    truncatedCategories: Math.max(
      0,
      summary.byCategory.length - CATEGORY_PREVIEW_LIMIT,
    ),
  };
}

function serializeExpenseList(expenses: SafeExpense[]): ReplyOutcome {
  return {
    outcome: "query_list",
    count: expenses.length,
    expenses: expenses.slice(0, LIST_PREVIEW_LIMIT).map(serializeExpense),
    truncated: expenses.length > LIST_PREVIEW_LIMIT,
  };
}

function getRecentUserMessage(state: FluxGraphState): string {
  return state.messageBatch.map((message) => message.content).join("\n") || "";
}

export function buildReplyContext(state: FluxGraphState): ReplyContextPayload {
  const recentUserMessage = getRecentUserMessage(state);
  const intent = state.intent ?? "unknown";

  if (state.error) {
    return {
      intent,
      outcome: { outcome: "error", message: state.error },
      recentUserMessage,
      instruction:
        "Apologize briefly and suggest the user try again. Do not expose technical details.",
      useDeterministicReply: false,
    };
  }

  switch (state.intent) {
    case "create_expense": {
      const createdExpenses = getCreatedExpenses(state);
      const extractedExpenses = state.extractedExpenses ?? [];
      const creatableCount = getCreatableExtractedExpenses(extractedExpenses).length;
      const partialCreateNote =
        creatableCount > createdExpenses.length
          ? " Some expenses could not be saved — mention that briefly."
          : "";
      const pendingExtractNote =
        extractedExpenses.length > createdExpenses.length &&
        creatableCount === createdExpenses.length
          ? ""
          : extractedExpenses.length > createdExpenses.length
            ? " Some mentioned expenses still need details — offer to finish those next."
            : "";

      if (createdExpenses.length > 1) {
        return {
          intent,
          outcome: {
            outcome: "expenses_created",
            expenses: createdExpenses.map(serializeExpense),
          },
          recentUserMessage: "",
          instruction: `Confirm exactly the expenses listed in the outcome were saved.${partialCreateNote}${pendingExtractNote}`,
          useDeterministicReply: true,
        };
      }

      if (createdExpenses.length === 1) {
        return {
          intent,
          outcome: {
            outcome: "expense_created",
            expense: serializeExpense(createdExpenses[0]!),
          },
          recentUserMessage: "",
          instruction:
            "Write a friendly confirmation that this expense was recorded. Use only the expense in the outcome.",
          useDeterministicReply: false,
        };
      }

      if (!isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)) {
        return {
          intent,
          outcome: {
            outcome: "needs_clarification",
            missingFields: state.missingFields,
            ...(state.expenseDraft ? { partialDraft: state.expenseDraft } : {}),
          },
          recentUserMessage,
          instruction:
            "Ask naturally for the missing information. Ask about only one field.",
          useDeterministicReply: false,
        };
      }

      return {
        intent,
        outcome: { outcome: "expense_create_failed" },
        recentUserMessage,
        instruction:
          "Explain that the expense could not be saved and suggest trying again.",
        useDeterministicReply: false,
      };
    }
    case "query_expenses": {
      if (state.spendingSummary) {
        return {
          intent,
          outcome: serializeSpendingSummary(state.spendingSummary),
          recentUserMessage,
          instruction:
            "Summarize the spending totals and category breakdown in a conversational way.",
          useDeterministicReply: false,
        };
      }

      if (state.queryResult) {
        return {
          intent,
          outcome: serializeExpenseList(state.queryResult),
          recentUserMessage,
          instruction:
            "Present the matching expenses clearly. Mention if more results exist.",
          useDeterministicReply: false,
        };
      }

      return {
        intent,
        outcome: { outcome: "query_failed" },
        recentUserMessage,
        instruction:
          "Apologize that the lookup failed and suggest trying again.",
        useDeterministicReply: false,
      };
    }
    case "update_expense": {
      if (state.updatedExpense) {
        return {
          intent,
          outcome: {
            outcome: "expense_updated",
            expense: serializeExpense(state.updatedExpense),
          },
          recentUserMessage,
          instruction:
            "Confirm the expense was updated using the provided expense data.",
          useDeterministicReply: false,
        };
      }

      return {
        intent,
        outcome: { outcome: "update_failed" },
        recentUserMessage,
        instruction:
          "Explain the update could not be completed and ask the user to be more specific.",
        useDeterministicReply: false,
      };
    }
    case "general_chat":
      return {
        intent,
        outcome: { outcome: "general_chat" },
        recentUserMessage,
        instruction:
          "Respond warmly and invite the user to tell you what they spent.",
        useDeterministicReply: false,
      };
    case "clarification":
      return {
        intent,
        outcome: { outcome: "clarification_ack" },
        recentUserMessage,
        instruction:
          "Acknowledge their answer and say you're using it to finish logging the expense.",
        useDeterministicReply: false,
      };
    case "unknown":
    default:
      return {
        intent: "unknown",
        outcome: { outcome: "unknown_intent" },
        recentUserMessage,
        instruction:
          "Gently say you didn't understand and give a short spending example.",
        useDeterministicReply: false,
      };
  }
}
