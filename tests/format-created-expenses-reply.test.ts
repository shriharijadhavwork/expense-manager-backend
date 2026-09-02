import { describe, expect, it } from "vitest";
import { formatCreatedExpensesReply } from "../src/ai/utils/format-created-expenses-reply.js";

describe("formatCreatedExpensesReply", () => {
  it("formats a single created expense", () => {
    const reply = formatCreatedExpensesReply([
      {
        id: "1",
        userId: "u1",
        amount: 450,
        currency: "INR",
        formattedAmount: "₹450.00",
        category: "food",
        note: "lunch",
        date: "2026-09-02",
        sourceThreadId: "t1",
        sourceMessageId: "m1",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ]);

    expect(reply).toBe("Logged ₹450.00 for food (lunch).");
  });

  it("formats multiple created expenses as a grounded bullet list", () => {
    const reply = formatCreatedExpensesReply([
      {
        id: "1",
        userId: "u1",
        amount: 120,
        currency: "INR",
        formattedAmount: "₹120.00",
        category: "food",
        note: "lunch share",
        date: "2026-09-02",
        sourceThreadId: "t1",
        sourceMessageId: "m1",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        id: "2",
        userId: "u1",
        amount: 30,
        currency: "INR",
        formattedAmount: "₹30.00",
        category: "transportation",
        note: "rapido",
        date: "2026-09-02",
        sourceThreadId: "t1",
        sourceMessageId: "m2",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ]);

    expect(reply).toContain("₹120.00");
    expect(reply).toContain("₹30.00");
    expect(reply).not.toContain("1017");
  });
});
