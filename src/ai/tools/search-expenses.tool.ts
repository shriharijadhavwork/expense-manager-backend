import type { SearchExpensesInput } from "../../schemas/expense.schema.js";
import {
  expenseService,
  type SafeExpense,
  type SpendingSummary,
} from "../../services/expense.service.js";
import type { ExpenseQuery } from "../schemas/expense-query.schema.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import type { ToolUserContext } from "./types.js";

export async function searchExpensesTool(
  context: ToolUserContext,
  query: ExpenseQuery,
): Promise<SafeExpense[]> {
  return aiExecutionService.withToolSpan("search_expenses", async () => {
    const filter: SearchExpensesInput = {};

    if (query.category) {
      filter.category = query.category;
    }
    if (query.from) {
      filter.from = query.from;
    }
    if (query.to) {
      filter.to = query.to;
    }

    return expenseService.search(context.userId, filter);
  });
}

export async function spendingSummaryTool(
  context: ToolUserContext,
  query: ExpenseQuery,
): Promise<SpendingSummary> {
  return aiExecutionService.withToolSpan("spending_summary", async () => {
    const filter: SearchExpensesInput = {};

    if (query.category) {
      filter.category = query.category;
    }
    if (query.from) {
      filter.from = query.from;
    }
    if (query.to) {
      filter.to = query.to;
    }

    return expenseService.getSpendingSummary(context.userId, filter);
  });
}
