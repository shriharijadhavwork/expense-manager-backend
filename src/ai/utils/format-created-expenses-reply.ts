import type { SafeExpense } from "../../services/expense.service.js";
import { getCategoryTitle } from "../../constants/expense-categories.js";
import { formatDisplayAmount } from "../../utils/format-currency.js";

function displayAmount(expense: SafeExpense): string {
  return formatDisplayAmount(expense.amount, expense.currency);
}

function formatCategoryForReply(expense: SafeExpense): string {
  const title = expense.categoryLabel ?? getCategoryTitle(expense.category);
  const subCategory = expense.subCategory?.trim();

  if (subCategory) {
    return `${title} · ${subCategory}`;
  }

  return title;
}

const MULTI_EXPENSE_INTROS = [
  "All set — here's what I logged:",
  "Done! Saved these:",
  "Noted — added to your tracker:",
  "Got those down for you:",
  "Logged the following:",
  "Tracked these expenses:",
  "Added to your spending:",
] as const;

const SINGLE_EXPENSE_INTROS = [
  (amount: string, category: string, note: string) =>
    `Logged ${amount} for ${category}${note}.`,
  (amount: string, category: string, note: string) =>
    `Saved ${amount} under ${category}${note}.`,
  (amount: string, category: string, note: string) =>
    `Noted ${amount} for ${category}${note}.`,
  (amount: string, category: string, note: string) =>
    `${amount} for ${category}${note} — got it.`,
  (amount: string, category: string, note: string) =>
    `Added ${amount} to ${category}${note}.`,
  (amount: string, category: string, note: string) =>
    `Tracked ${amount} for ${category}${note}.`,
] as const;

function hashSeed(parts: string[]): number {
  let hash = 0;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = (hash * 31 + part.charCodeAt(index)) >>> 0;
    }
  }
  return hash;
}

function pickIntroIndex(expenses: SafeExpense[]): number {
  const seed = expenses.map(
    (expense) => `${expense.id}:${expense.sourceMessageId ?? ""}`,
  );
  return hashSeed(seed) % MULTI_EXPENSE_INTROS.length;
}

function pickSingleIntroIndex(expense: SafeExpense): number {
  const seed = [`${expense.id}:${expense.sourceMessageId ?? ""}`];
  return hashSeed(seed) % SINGLE_EXPENSE_INTROS.length;
}

function formatCreatedExpenseLine(expense: SafeExpense): string {
  const note = expense.note ? ` (${expense.note})` : "";
  return `- **${displayAmount(expense)}** for ${formatCategoryForReply(expense)}${note}`;
}

export function formatCreatedExpensesReply(expenses: SafeExpense[]): string {
  if (expenses.length === 0) {
    return "I could not save any expenses. Please try again.";
  }

  if (expenses.length === 1) {
    const expense = expenses[0]!;
    const note = expense.note ? ` (${expense.note})` : "";
    const intro = SINGLE_EXPENSE_INTROS[pickSingleIntroIndex(expense)]!;
    return intro(displayAmount(expense), formatCategoryForReply(expense), note);
  }

  const intro = MULTI_EXPENSE_INTROS[pickIntroIndex(expenses)]!;
  return `${intro}\n${expenses.map(formatCreatedExpenseLine).join("\n")}`;
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
