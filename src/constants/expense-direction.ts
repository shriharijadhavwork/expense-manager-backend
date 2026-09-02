import { z } from "zod";

export const EXPENSE_DIRECTIONS = ["debit", "credit"] as const;

export type ExpenseDirection = (typeof EXPENSE_DIRECTIONS)[number];

export const DEFAULT_EXPENSE_DIRECTION: ExpenseDirection = "debit";

export const expenseDirectionSchema = z.enum(EXPENSE_DIRECTIONS);

export function resolveExpenseDirection(
  direction?: ExpenseDirection | null,
): ExpenseDirection {
  return direction ?? DEFAULT_EXPENSE_DIRECTION;
}
