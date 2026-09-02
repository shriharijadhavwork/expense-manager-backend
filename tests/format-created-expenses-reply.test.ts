import { describe, expect, it } from "vitest";
import { formatCreatedExpensesReply } from "../src/ai/utils/format-created-expenses-reply.js";

const baseExpense = {
  userId: "u1",
  direction: "debit" as const,
  subCategory: "",
  sourceThreadId: "t1",
  sourceMessageId: "m1",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

describe("formatCreatedExpensesReply", () => {
  it("formats a single created expense with display category title", () => {
    const reply = formatCreatedExpensesReply([
      {
        ...baseExpense,
        id: "1",
        amount: 450,
        currency: "INR",
        formattedAmount: "₹450.00",
        category: "food_and_dining",
        categoryLabel: "Food & Dining",
        note: "lunch",
        date: "2026-09-02",
      },
    ]);

    expect(reply).toContain("₹450");
    expect(reply).toContain("Food & Dining");
    expect(reply).not.toContain("food_and_dining");
    expect(reply).toContain("lunch");
  });

  it("uses a stable varied intro for the same expense", () => {
    const expense = {
      ...baseExpense,
      id: "1",
      amount: 450,
      currency: "INR",
      formattedAmount: "₹450.00",
      category: "food_and_dining",
      categoryLabel: "Food & Dining",
      note: "lunch",
      date: "2026-09-02",
    };

    const first = formatCreatedExpensesReply([expense]);
    const second = formatCreatedExpensesReply([expense]);

    expect(first).toBe(second);
    expect(first).not.toContain("Got it — I've saved");
  });

  it("formats multiple created expenses as a grounded bullet list", () => {
    const reply = formatCreatedExpensesReply([
      {
        ...baseExpense,
        id: "1",
        amount: 120,
        currency: "INR",
        formattedAmount: "₹120.00",
        category: "food_and_dining",
        categoryLabel: "Food & Dining",
        subCategory: "Snacks",
        note: "lunch share",
        date: "2026-09-02",
        sourceMessageId: "m1",
      },
      {
        ...baseExpense,
        id: "2",
        amount: 30,
        currency: "INR",
        formattedAmount: "₹30.00",
        category: "transportation",
        categoryLabel: "Transportation",
        subCategory: "Ride Hailing",
        note: "rapido",
        date: "2026-09-02",
        sourceMessageId: "m2",
      },
    ]);

    expect(reply).toContain("₹120");
    expect(reply).toContain("₹30");
    expect(reply).toContain("Food & Dining · Snacks");
    expect(reply).toContain("Transportation · Ride Hailing");
    expect(reply).not.toContain("1017");
    expect(reply).toMatch(/^[^:]+:\n- \*\*₹120\*\*/);
    expect(reply).not.toContain("Got it — I've saved");
    expect(reply).not.toContain("food_and_dining");
  });

  it("formats USD with symbol for chat replies", () => {
    const reply = formatCreatedExpensesReply([
      {
        ...baseExpense,
        id: "1",
        amount: 15,
        currency: "USD",
        formattedAmount: "15",
        category: "food_and_dining",
        categoryLabel: "Food & Dining",
        note: "lunch",
        date: "2026-09-02",
      },
    ]);

    expect(reply).toContain("$15");
    expect(reply).not.toContain("₹");
    expect(reply).not.toContain("food_and_dining");
  });
});
