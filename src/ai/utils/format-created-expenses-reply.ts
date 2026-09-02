import type { SafeExpense } from "../../services/expense.service.js";

function formatCreatedExpenseLine(expense: SafeExpense): string {
  const note = expense.note ? ` (${expense.note})` : "";
  return `- **${expense.formattedAmount}** for ${expense.category}${note}`;
}

export function formatCreatedExpensesReply(expenses: SafeExpense[]): string {
  if (expenses.length === 0) {
    return "I could not save any expenses. Please try again.";
  }

  if (expenses.length === 1) {
    const expense = expenses[0]!;
    const note = expense.note ? ` (${expense.note})` : "";
    return `Logged ${expense.formattedAmount} for ${expense.category}${note}.`;
  }

  return `Got it — I've saved:\n${expenses.map(formatCreatedExpenseLine).join("\n")}`;
}

export function getCreatedExpenses(state: {
  createdExpenses?: SafeExpense[];
  createdExpense?: SafeExpense;
}): SafeExpense[] {
  if (state.createdExpenses && state.createdExpenses.length > 0) {
    return state.createdExpenses;
  }

  return state.createdExpense ? [state.createdExpense] : [];
}

export function getCreatedExpenseIds(result: {
  createdExpenses?: Array<{ id: string }>;
  createdExpense?: { id: string };
}): string[] | undefined {
  const ids = getCreatedExpenses(result).map((expense) => expense.id);
  return ids.length > 0 ? ids : undefined;
}
