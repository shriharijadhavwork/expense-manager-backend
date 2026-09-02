import { describe, expect, it } from "vitest";
import { buildReplyContext } from "../src/ai/utils/build-reply-context.js";

describe("buildReplyContext (Batch B)", () => {
  it("builds needs_clarification outcome for incomplete expense draft", () => {
    const context = buildReplyContext({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "Lunch was expensive",
        },
      ],
      recentMessages: [],
      intent: "create_expense",
      expenseDraft: { category: "food" },
      missingFields: ["amount"],
    });

    expect(context.outcome.outcome).toBe("needs_clarification");
    if (context.outcome.outcome === "needs_clarification") {
      expect(context.outcome.missingFields).toEqual(["amount"]);
      expect(context.outcome.partialDraft?.category).toBe("food");
    }
  });

  it("builds query_summary outcome from spending summary", () => {
    const context = buildReplyContext({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "How much on food?",
        },
      ],
      recentMessages: [],
      intent: "query_expenses",
      spendingSummary: {
        count: 2,
        totals: [
          {
            currency: "INR",
            amount: 500,
            formattedAmount: "₹500.00",
          },
        ],
        byCategory: [
          {
            category: "food",
            currency: "INR",
            amount: 500,
            formattedAmount: "₹500.00",
            count: 2,
          },
        ],
      },
    });

    expect(context.outcome.outcome).toBe("query_summary");
    if (context.outcome.outcome === "query_summary") {
      expect(context.outcome.count).toBe(2);
      expect(context.outcome.byCategory[0]?.category).toBe("food");
    }
  });

  it("builds general_chat outcome", () => {
    const context = buildReplyContext({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "Hello FLUX",
        },
      ],
      recentMessages: [],
      intent: "general_chat",
    });

    expect(context.outcome.outcome).toBe("general_chat");
  });

  it("builds expenses_created outcome without passing batch text to the reply", () => {
    const context = buildReplyContext({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "i spent 120 for lunch share",
        },
        {
          id: "507f1f77bcf86cd799439014",
          role: "user",
          content: "i spent 30 for rapido today",
        },
      ],
      recentMessages: [],
      intent: "create_expense",
      extractedExpenses: [],
      createdExpenses: [
        {
          id: "1",
          userId: "507f1f77bcf86cd799439012",
          amount: 120,
          currency: "INR",
          formattedAmount: "₹120.00",
          category: "food",
          note: "lunch share",
          date: "2026-09-02",
          sourceThreadId: "507f1f77bcf86cd799439011",
          sourceMessageId: "507f1f77bcf86cd799439013",
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "2",
          userId: "507f1f77bcf86cd799439012",
          amount: 30,
          currency: "INR",
          formattedAmount: "₹30.00",
          category: "transportation",
          note: "rapido",
          date: "2026-09-02",
          sourceThreadId: "507f1f77bcf86cd799439011",
          sourceMessageId: "507f1f77bcf86cd799439014",
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });

    expect(context.outcome.outcome).toBe("expenses_created");
    expect(context.recentUserMessage).toBe("");
    expect(context.useDeterministicReply).toBe(true);
    if (context.outcome.outcome === "expenses_created") {
      expect(context.outcome.expenses).toHaveLength(2);
      expect(context.outcome.expenses.map((expense) => expense.amount)).toEqual([
        120, 30,
      ]);
    }
  });
});
