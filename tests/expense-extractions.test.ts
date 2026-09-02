import { describe, expect, it } from "vitest";
import { expenseExtractionsSchema } from "../src/ai/schemas/expense-extractions.schema.js";
import { normalizeExtractedExpenses } from "../src/ai/utils/normalize-extracted-expenses.js";
import type { SafeMessage } from "../src/ai/graph/state.js";

const REFERENCE_AT = "2026-09-02T15:30:00.000Z";

function userMessage(
  id: string,
  content: string,
  createdAt = REFERENCE_AT,
): SafeMessage {
  return { id, role: "user", content, createdAt };
}

describe("expenseExtractionsSchema", () => {
  it("accepts the multi-expense expenses array format", () => {
    const parsed = expenseExtractionsSchema.parse({
      expenses: [
        {
          sourceMessageId: "msg-lunch",
          amount: 120,
          category: "food",
          note: "lunch share",
          dateHint: "today",
        },
        {
          sourceMessageId: "msg-rapido",
          amount: 30,
          category: "transportation",
          note: "rapido",
          dateHint: "today",
        },
      ],
      skippedMessageIds: ["msg-hi"],
    });

    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(120);
    expect(parsed.expenses[1]?.expenseDraft.category).toBe("transportation");
    expect(parsed.skippedMessageIds).toEqual(["msg-hi"]);
  });

  it("normalizes a legacy single flat expense object", () => {
    const parsed = expenseExtractionsSchema.parse({
      amount: 12000,
      category: "rent",
      note: "rent at my pg",
    });

    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(12000);
  });

  it("normalizes a top-level array of expenses", () => {
    const parsed = expenseExtractionsSchema.parse([
      { amount: 500, category: "food", note: "lunch" },
      { amount: 200, category: "transport" },
    ]);

    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(500);
    expect(parsed.expenses[1]?.expenseDraft.amount).toBe(200);
  });
});

describe("normalizeExtractedExpenses", () => {
  it("applies per-message reference dates and dedupes repeats", () => {
    const messageBatch = [
      userMessage("msg-lunch", "i spent 120 for lunch share", "2026-09-02T10:00:00.000Z"),
      userMessage("msg-lunch-dup", "i spent 120 for lunch share", "2026-09-02T10:05:00.000Z"),
      userMessage("msg-rapido", "i spent 30 for rapido today", "2026-09-02T17:00:00.000Z"),
    ];

    const normalized = normalizeExtractedExpenses({
      raw: expenseExtractionsSchema.parse({
        expenses: [
          {
            sourceMessageId: "msg-lunch",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
          {
            sourceMessageId: "msg-lunch-dup",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
          {
            sourceMessageId: "msg-rapido",
            amount: 30,
            category: "transportation",
            note: "rapido",
            dateHint: "today",
          },
        ],
      }),
      messageBatch,
      defaultCurrency: "INR",
    });

    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0]?.sourceMessageId).toBe("msg-lunch");
    expect(normalized.items[1]?.sourceMessageId).toBe("msg-rapido");
    expect(normalized.items[0]?.draft.date).toBe("2026-09-02");
    expect(normalized.items[1]?.draft.date).toBe("2026-09-02");
    expect(normalized.items.every((item) => item.missingFields.length === 0)).toBe(
      true,
    );
  });

  it("supports two expenses from one message with the same sourceMessageId", () => {
    const messageBatch = [
      userMessage("msg-multi", "500 on dinner and 30 on rapido today"),
    ];

    const normalized = normalizeExtractedExpenses({
      raw: expenseExtractionsSchema.parse({
        expenses: [
          {
            sourceMessageId: "msg-multi",
            amount: 500,
            category: "food",
            note: "dinner",
            dateHint: "today",
          },
          {
            sourceMessageId: "msg-multi",
            amount: 30,
            category: "transportation",
            note: "rapido",
            dateHint: "today",
          },
        ],
      }),
      messageBatch,
      defaultCurrency: "INR",
    });

    expect(normalized.items).toHaveLength(2);
    expect(normalized.items.every((item) => item.sourceMessageId === "msg-multi")).toBe(
      true,
    );
  });

  it("falls back to amount matching when sourceMessageId is missing", () => {
    const messageBatch = [
      userMessage("msg-lunch", "i spent 120 for lunch share"),
      userMessage("msg-rapido", "i spent 30 for rapido today"),
    ];

    const normalized = normalizeExtractedExpenses({
      raw: expenseExtractionsSchema.parse({
        expenses: [{ amount: 30, category: "transportation", note: "rapido" }],
      }),
      messageBatch,
      defaultCurrency: "INR",
    });

    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]?.sourceMessageId).toBe("msg-rapido");
  });
});
