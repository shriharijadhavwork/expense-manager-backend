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
    expect(result.assistantReply).toContain("Logged");
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
    expect(result.assistantReply).toContain("How much");
    expect(createExpenseToolMock).not.toHaveBeenCalled();
  });

  it("skips extraction for general chat", async () => {
    const provider = createSequentialProvider([
      async () => ({ intent: "general_chat" }),
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
    expect(result.assistantReply).toContain("FLUX");
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
      expenseDraft: { amount: 10, category: "coffee" },
      dateHint: "today",
    });
    expect(parsed.expenseDraft.amount).toBe(10);
    expect(parsed.dateHint).toBe("today");
  });

  it("rejects invalid extraction payloads", () => {
    const result = expenseExtractionSchema.safeParse({
      expenseDraft: { amount: -5 },
    });
    expect(result.success).toBe(false);
  });
});
