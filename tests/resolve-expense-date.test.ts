import { describe, expect, it } from "vitest";
import { resolveExpenseDate } from "../src/ai/tools/resolve-expense-date.tool.js";

const REFERENCE = new Date("2026-09-02T15:30:00.000Z");

describe("resolveExpenseDate", () => {
  it("uses explicit YYYY-MM-DD when provided", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        explicitDate: "2026-08-20",
      }),
    ).toBe("2026-08-20");
  });

  it("defaults to the reference message date in UTC when no hint is given", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
      }),
    ).toBe("2026-09-02");
  });

  it("resolves yesterday from dateHint", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        dateHint: "yesterday",
      }),
    ).toBe("2026-09-01");
  });

  it("resolves day before yesterday from dateHint", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        dateHint: "day_before_yesterday",
      }),
    ).toBe("2026-08-31");
  });

  it("resolves last week as reference minus 7 days", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        dateHint: "last_week",
      }),
    ).toBe("2026-08-26");
  });

  it("detects yesterday from message text when dateHint is absent", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        messageText: "Paid rent yesterday at my pg",
      }),
    ).toBe("2026-09-01");
  });

  it("prefers explicit date over dateHint", () => {
    expect(
      resolveExpenseDate({
        referenceAt: REFERENCE,
        explicitDate: "2026-08-01",
        dateHint: "yesterday",
      }),
    ).toBe("2026-08-01");
  });
});

describe("expenseExtractionsSchema legacy compatibility", () => {
  it("accepts flat JSON without expenseDraft wrapper", async () => {
    const { expenseExtractionSchema } = await import(
      "../src/ai/schemas/expense-extraction.schema.js"
    );

    const parsed = expenseExtractionSchema.parse({
      amount: 12000,
      category: "rent",
      note: "rent at my pg",
      missingFields: ["date", "currency"],
    });

    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(12000);
    expect(parsed.expenses[0]?.expenseDraft.category).toBe("rent");
  });

  it("normalizes a single-item array response", async () => {
    const { expenseExtractionSchema } = await import(
      "../src/ai/schemas/expense-extraction.schema.js"
    );

    const parsed = expenseExtractionSchema.parse([
      { amount: 500, category: "food", note: "lunch" },
    ]);

    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(500);
    expect(parsed.expenses[0]?.expenseDraft.category).toBe("food");
  });

  it("keeps all items when the model returns multiple expenses", async () => {
    const { expenseExtractionSchema } = await import(
      "../src/ai/schemas/expense-extraction.schema.js"
    );

    const parsed = expenseExtractionSchema.parse([
      { amount: 500, category: "food" },
      { amount: 200, category: "transport" },
    ]);

    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(500);
    expect(parsed.expenses[1]?.expenseDraft.amount).toBe(200);
  });
});

describe("applyExpenseDefaults", () => {
  it("fills date and currency automatically", async () => {
    const { applyExpenseDefaults } = await import(
      "../src/ai/utils/expense-draft.js"
    );

    const draft = applyExpenseDefaults({
      draft: { amount: 12000, category: "rent" },
      defaultCurrency: "INR",
      referenceAt: REFERENCE,
      messageText: "rent at my pg",
    });

    expect(draft.date).toBe("2026-09-02");
    expect(draft.currency).toBe("INR");
  });

  it("only requires amount and category for completeness", async () => {
    const {
      applyExpenseDefaults,
      getMissingExpenseFields,
      isExpenseDraftComplete,
    } = await import("../src/ai/utils/expense-draft.js");

    const draft = applyExpenseDefaults({
      draft: { amount: 100, category: "food" },
      defaultCurrency: "INR",
      referenceAt: REFERENCE,
    });

    expect(getMissingExpenseFields(draft)).toEqual([]);
    expect(isExpenseDraftComplete(draft, "INR")).toBe(true);
  });
});
