import { updateExpenseTool } from "../../tools/update-expense.tool.js";
import type { FluxGraphState } from "../state.js";

export async function updateExpenseNode(
  state: FluxGraphState,
): Promise<Partial<FluxGraphState>> {
  if (state.error || !state.expenseUpdate) {
    return {};
  }

  try {
    const updatedExpense = await updateExpenseTool(
      { userId: state.userId },
      state.expenseUpdate,
    );

    return { updatedExpense };
  } catch (error) {
    console.error("[ai] updateExpenseNode failed", error);
    return { error: "Could not update expense" };
  }
}
