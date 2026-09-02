import { createExpenseSchema } from "../../schemas/expense.schema.js";
import {
  getCategoryTitle,
  normalizeSubCategoryText,
  resolveExpenseCategory,
} from "../../constants/expense-categories.js";
import {
  resolveExpenseDirection,
} from "../../constants/expense-direction.js";
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

    const category = resolveExpenseCategory(draft.category);
    const input = createExpenseSchema.parse({
      amount: draft.amount,
      category,
      subCategory: normalizeSubCategoryText(draft.subCategory),
      direction: resolveExpenseDirection(draft.direction),
      date: draft.date,
      currency: draft.currency ?? defaultCurrency,
      note: draft.note?.trim() ? draft.note : "",
    });

    const defaultNote = input.subCategory
      ? input.subCategory
      : getCategoryTitle(category);

    return expenseService.createFromChat(
      context.userId,
      context.threadId,
      context.messageId,
      {
        ...input,
        note: input.note || defaultNote,
      },
    );
  });
}
