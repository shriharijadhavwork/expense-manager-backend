import type { UpdateExpenseInput } from "../../schemas/expense.schema.js";
import {
  expenseService,
  type SafeExpense,
} from "../../services/expense.service.js";
import { ApiError } from "../../utils/api-error.js";
import type { ExpenseUpdateExtraction } from "../schemas/expense-update-extraction.schema.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import type { ToolUserContext } from "./types.js";

async function resolveExpenseId(
  userId: string,
  input: ExpenseUpdateExtraction,
): Promise<string> {
  if (input.expenseId) {
    return input.expenseId;
  }

  if (!input.match) {
    throw ApiError.badRequest("Expense match criteria are required");
  }

  const searchInput: {
    category?: string;
    from?: string;
    to?: string;
  } = {};

  if (input.match.category) {
    searchInput.category = input.match.category;
  }
  if (input.match.date) {
    searchInput.from = input.match.date;
    searchInput.to = input.match.date;
  }

  const matches = await expenseService.search(userId, searchInput);

  const filtered = input.match.amount
    ? matches.filter((expense) => expense.amount === input.match!.amount)
    : matches;

  if (filtered.length === 1) {
    return filtered[0]!.id;
  }

  if (filtered.length === 0) {
    throw ApiError.notFound("No matching expense found to update");
  }

  throw ApiError.badRequest(
    "Multiple expenses match — please be more specific",
  );
}

export async function updateExpenseTool(
  context: ToolUserContext,
  input: ExpenseUpdateExtraction,
): Promise<SafeExpense> {
  return aiExecutionService.withToolSpan("update_expense", async () => {
    const expenseId = await resolveExpenseId(context.userId, input);
    const updates: UpdateExpenseInput = input.updates;

    return expenseService.update(context.userId, expenseId, updates);
  });
}
