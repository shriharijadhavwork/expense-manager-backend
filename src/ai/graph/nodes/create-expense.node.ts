import { createExpenseTool } from "../../tools/create-expense.tool.js";
import { isExpenseDraftComplete } from "../../utils/expense-draft.js";
import type { FluxGraphState } from "../state.js";

export async function createExpenseNode(
  state: FluxGraphState,
): Promise<Partial<FluxGraphState>> {
  if (state.error || state.intent !== "create_expense") {
    return {};
  }

  if (!isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)) {
    return {};
  }

  const sourceMessageId =
    state.sourceMessageId ?? state.messageBatch.at(-1)?.id;

  if (!sourceMessageId) {
    return { error: "No source message for expense creation" };
  }

  try {
    const expense = await createExpenseTool(
      {
        userId: state.userId,
        threadId: state.threadId,
        messageId: sourceMessageId,
      },
      state.expenseDraft!,
      state.defaultCurrency,
    );

    return { createdExpense: expense };
  } catch (error) {
    console.error("[ai] createExpenseTool failed", error);
    return { error: "Could not create expense from chat message" };
  }
}
