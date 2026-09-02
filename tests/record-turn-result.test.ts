import { describe, expect, it } from "vitest";
import { getCreatedExpenseIds } from "../src/ai/utils/format-created-expenses-reply.js";
import { resolvePersistedExpenseDraft } from "../src/ai/utils/resolve-persisted-expense-draft.js";

describe("getCreatedExpenseIds", () => {
  it("returns all ids from createdExpenses", () => {
    expect(
      getCreatedExpenseIds({
        createdExpenses: [{ id: "e1" }, { id: "e2" }],
      }),
    ).toEqual(["e1", "e2"]);
  });

  it("falls back to createdExpense", () => {
    expect(getCreatedExpenseIds({ createdExpense: { id: "e1" } })).toEqual([
      "e1",
    ]);
  });
});

describe("resolvePersistedExpenseDraft", () => {
  it("persists the first incomplete extracted expense after partial create", () => {
    const persisted = resolvePersistedExpenseDraft({
      intent: "create_expense",
      defaultCurrency: "INR",
      missingFields: [],
      createdExpensesCount: 1,
      extractedExpenses: [
        {
          draft: { amount: 120, category: "food", date: "2026-09-02", currency: "INR" },
          sourceMessageId: "m1",
          missingFields: [],
        },
        {
          draft: { category: "transportation" },
          sourceMessageId: "m2",
          missingFields: ["amount"],
        },
      ],
    });

    expect(persisted?.draft.category).toBe("transportation");
    expect(persisted?.missingFields).toEqual(["amount"]);
  });

  it("clears draft persistence when all extracted expenses were created", () => {
    const persisted = resolvePersistedExpenseDraft({
      intent: "create_expense",
      defaultCurrency: "INR",
      missingFields: [],
      createdExpensesCount: 2,
      extractedExpenses: [
        {
          draft: { amount: 120, category: "food", date: "2026-09-02", currency: "INR" },
          sourceMessageId: "m1",
          missingFields: [],
        },
        {
          draft: {
            amount: 30,
            category: "transportation",
            date: "2026-09-02",
            currency: "INR",
          },
          sourceMessageId: "m2",
          missingFields: [],
        },
      ],
    });

    expect(persisted).toBeNull();
  });
});
