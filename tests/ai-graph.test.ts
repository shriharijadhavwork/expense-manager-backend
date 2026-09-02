import { afterEach, describe, expect, it, vi } from "vitest";

process.env["NODE_ENV"] = "test";
process.env["PORT"] = "5050";
process.env["JWT_SECRET"] = "test-jwt-secret-16chars";
process.env["JWT_EXPIRES_IN"] = "1h";
process.env["FRONTEND_URL"] = "http://localhost:3000";
process.env["MONGODB_URI"] = "mongodb://127.0.0.1:27017/expense-manager-test";
process.env["CLOUDINARY_CLOUD_NAME"] = "test-cloud";
process.env["CLOUDINARY_API_KEY"] = "test-key";
process.env["CLOUDINARY_API_SECRET"] = "test-secret";
process.env["EMAIL_PROVIDER"] = "console";
process.env["EMAIL_FROM"] = "Flux Team <noreply@localhost>";
process.env["GEMINI_API_KEY"] = "";
process.env["GEMINI_MODEL"] = "gemini-2.5-flash";

const createExpenseToolMock = vi.fn();

vi.mock("../src/ai/tools/create-expense.tool.js", () => ({
  createExpenseTool: (...args: unknown[]) => createExpenseToolMock(...args),
}));

import type { LlmProvider } from "../src/ai/types.js";

const { createFluxGraph } = await import("../src/ai/graph/flux.graph.js");
const {
  getMissingExpenseFields,
  isExpenseDraftComplete,
} = await import("../src/ai/utils/expense-draft.js");
const { intentClassificationSchema } = await import(
  "../src/ai/schemas/intent-classification.schema.js"
);
const { expenseExtractionSchema } = await import(
  "../src/ai/schemas/expense-extraction.schema.js"
);

function createSequentialProvider(
  responses: Array<() => Promise<unknown>>,
): LlmProvider {
  let callIndex = 0;

  return {
    name: "mock",
    async generateStructured<T>(input: {
      schema: { parse: (value: unknown) => T };
    }): Promise<T> {
      const handler = responses[callIndex];
      if (!handler) {
        throw new Error(`No mock response for LLM call ${callIndex}`);
      }
      callIndex += 1;
      const value = await handler();
      return input.schema.parse(value);
    },
  };
}

describe("expense draft utils (Batch 2)", () => {
  it("detects missing required fields", () => {
    expect(
      getMissingExpenseFields({ amount: 100 }),
    ).toEqual(["category"]);
  });

  it("does not require date or currency after defaults are applied", async () => {
    const { applyExpenseDefaults, getMissingExpenseFields } = await import(
      "../src/ai/utils/expense-draft.js"
    );

    const draft = applyExpenseDefaults({
      draft: { amount: 100, category: "food" },
      defaultCurrency: "INR",
      referenceAt: new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(getMissingExpenseFields(draft)).toEqual([]);
  });

  it("treats default currency as present", () => {
    expect(
      isExpenseDraftComplete(
        {
          amount: 100,
          category: "food",
        },
        "INR",
      ),
    ).toBe(true);
  });
});

describe("flux graph (Batch 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createExpenseToolMock.mockReset();
  });

  it("classifies create_expense, extracts a complete draft, and creates the expense", async () => {
    createExpenseToolMock.mockResolvedValue({
      id: "507f1f77bcf86cd799439099",
      userId: "507f1f77bcf86cd799439012",
      amount: 450,
      currency: "INR",
      formattedAmount: "₹450.00",
      category: "food",
      note: "lunch",
      date: "2026-09-02",
      sourceThreadId: "507f1f77bcf86cd799439011",
      sourceMessageId: "507f1f77bcf86cd799439013",
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenseDraft: {
          amount: 450,
          category: "food",
          date: "2026-09-02",
          currency: "INR",
          note: "lunch",
        },
      }),
      async () => ({
        reply: "Got it — I've noted your ₹450 lunch under food for today.",
      }),
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "Spent 450 on lunch today",
        },
      ],
      recentMessages: [],
    });

    expect(result.intent).toBe("create_expense");
    expect(result.expenseDraft?.amount).toBe(450);
    expect(result.missingFields).toEqual([]);
    expect(result.createdExpense?.formattedAmount).toBe("₹450.00");
    expect(result.assistantReply).toContain("noted your ₹450 lunch");
    expect(createExpenseToolMock).toHaveBeenCalledOnce();
  });

  it("asks for missing fields when extraction is incomplete", async () => {
    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenseDraft: {
          category: "food",
        },
        missingFields: ["amount"],
      }),
      async () => ({
        reply: "How much did lunch cost?",
      }),
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
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
    });

    expect(result.missingFields).toContain("amount");
    expect(result.assistantReply).toContain("How much did lunch cost");
    expect(createExpenseToolMock).not.toHaveBeenCalled();
  });

  it("falls back to deterministic reply when build_reply LLM fails", async () => {
    createExpenseToolMock.mockResolvedValue({
      id: "507f1f77bcf86cd799439099",
      userId: "507f1f77bcf86cd799439012",
      amount: 450,
      currency: "INR",
      formattedAmount: "₹450.00",
      category: "food",
      note: "lunch",
      date: "2026-09-02",
      sourceThreadId: "507f1f77bcf86cd799439011",
      sourceMessageId: "507f1f77bcf86cd799439013",
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenseDraft: {
          amount: 450,
          category: "food",
          date: "2026-09-02",
          currency: "INR",
          note: "lunch",
        },
      }),
      async () => {
        throw new Error("LLM unavailable");
      },
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "Spent 450 on lunch today",
        },
      ],
      recentMessages: [],
    });

    expect(result.assistantReply).toContain("Logged");
  });

  it("skips extraction for general chat", async () => {
    const provider = createSequentialProvider([
      async () => ({ intent: "general_chat" }),
      async () => ({
        reply: "Hey! I'm FLUX — tell me what you spent and I'll keep track.",
      }),
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
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
    });

    expect(result.intent).toBe("general_chat");
    expect(result.expenseDraft).toBeUndefined();
    expect(result.assistantReply).toContain("keep track");
  });
});

describe("structured schemas (Batch 2)", () => {
  it("validates intent classification output", () => {
    const parsed = intentClassificationSchema.parse({
      intent: "create_expense",
      confidence: 0.9,
    });
    expect(parsed.intent).toBe("create_expense");
  });

  it("validates expense extraction output", () => {
    const parsed = expenseExtractionSchema.parse({
      expenses: [{ expenseDraft: { amount: 10, category: "coffee" }, dateHint: "today" }],
    });
    expect(parsed.expenses[0]?.expenseDraft.amount).toBe(10);
    expect(parsed.expenses[0]?.dateHint).toBe("today");
  });

  it("rejects invalid extraction payloads", () => {
    const result = expenseExtractionSchema.safeParse({
      expenses: [{ expenseDraft: { amount: -5 } }],
    });
    expect(result.success).toBe(false);
  });

  it("creates every complete extracted expense", async () => {
    createExpenseToolMock
      .mockResolvedValueOnce({
        id: "507f1f77bcf86cd799439099",
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
      })
      .mockResolvedValueOnce({
        id: "507f1f77bcf86cd79943909a",
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
      });

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenses: [
          {
            sourceMessageId: "507f1f77bcf86cd799439013",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
          {
            sourceMessageId: "507f1f77bcf86cd799439014",
            amount: 30,
            category: "transportation",
            note: "rapido",
            dateHint: "today",
          },
        ],
      }),
      async () => ({
        reply: "Saved your lunch and rapido expenses.",
      }),
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          role: "user",
          content: "i spent 120 for lunch share",
          createdAt: "2026-09-02T10:00:00.000Z",
        },
        {
          id: "507f1f77bcf86cd799439014",
          role: "user",
          content: "i spent 30 for rapido today",
          createdAt: "2026-09-02T17:00:00.000Z",
        },
      ],
      recentMessages: [],
    });

    expect(result.extractedExpenses).toHaveLength(2);
    expect(result.extractedExpenses[0]?.sourceMessageId).toBe(
      "507f1f77bcf86cd799439013",
    );
    expect(result.extractedExpenses[1]?.sourceMessageId).toBe(
      "507f1f77bcf86cd799439014",
    );
    expect(result.multipleExpensesDetected).toBe(true);
    expect(result.multipleExpenseCount).toBe(2);
    expect(result.createdExpenses).toHaveLength(2);
    expect(result.createdExpenses[0]?.amount).toBe(120);
    expect(result.createdExpenses[1]?.amount).toBe(30);
    expect(createExpenseToolMock).toHaveBeenCalledTimes(2);
    expect(createExpenseToolMock.mock.calls[0]?.[0]).toMatchObject({
      messageId: "507f1f77bcf86cd799439013",
    });
    expect(createExpenseToolMock.mock.calls[1]?.[0]).toMatchObject({
      messageId: "507f1f77bcf86cd799439014",
    });
  });
});
