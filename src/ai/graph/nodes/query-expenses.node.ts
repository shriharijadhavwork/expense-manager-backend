import {
  searchExpensesTool,
  spendingSummaryTool,
} from "../../tools/search-expenses.tool.js";
import type { FluxGraphState } from "../state.js";

export async function queryExpensesNode(
  state: FluxGraphState,
): Promise<Partial<FluxGraphState>> {
  if (state.error || !state.expenseQuery) {
    return {};
  }

  try {
    if (state.expenseQuery.mode === "list") {
      const queryResult = await searchExpensesTool(
        { userId: state.userId },
        state.expenseQuery,
      );
      return { queryResult };
    }

    const spendingSummary = await spendingSummaryTool(
      { userId: state.userId },
      state.expenseQuery,
    );

    return { spendingSummary };
  } catch (error) {
    console.error("[ai] queryExpensesNode failed", error);
    return { error: "Could not search expenses" };
  }
}
