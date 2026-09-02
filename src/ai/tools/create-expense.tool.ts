import { createExpenseSchema } from "../../schemas/expense.schema.js";
import {
  expenseService,
  type SafeExpense,
} from "../../services/expense.service.js";
import { ApiError } from "../../utils/api-error.js";
import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import { isExpenseDraftComplete } from "../utils/expense-draft.js";
import type { ToolContext } from "./types.js";

export async function createExpenseTool(
  context: ToolContext,
  draft: ExpenseDraft,
  defaultCurrency: string,
): Promise<SafeExpense> {
  return aiExecutionService.withToolSpan("create_expense", async () => {
    if (!isExpenseDraftComplete(draft, defaultCurrency)) {
      throw ApiError.badRequest("Expense draft is incomplete");
    }

    const input = createExpenseSchema.parse({
      amount: draft.amount,
      category: draft.category,
      date: draft.date,
      currency: draft.currency ?? defaultCurrency,
      note: draft.note?.trim() ? draft.note : "",
    });

    return expenseService.createFromChat(
      context.userId,
      context.threadId,
      context.messageId,
      {
        ...input,
        note: input.note || input.category,
      },
    );
  });
}
