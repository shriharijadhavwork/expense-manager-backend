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
import type { SafeExpense } from "../src/services/expense.service.js";

const { createFluxGraph } = await import("../src/ai/graph/flux.graph.js");
const { computeLastProcessedMessageId } = await import(
  "../src/ai/utils/compute-last-processed-message-id.js"
);
const { resolvePersistedExpenseDraft } = await import(
  "../src/ai/utils/resolve-persisted-expense-draft.js"
);
const { buildReplyContext } = await import(
  "../src/ai/utils/build-reply-context.js"
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

function mockCreatedExpense(input: {
  id: string;
  amount: number;
  category: string;
  note: string;
  sourceMessageId: string;
}): SafeExpense {
  return {
    id: input.id,
    userId: "507f1f77bcf86cd799439012",
    amount: input.amount,
    currency: "INR",
    formattedAmount: `₹${input.amount}.00`,
    category: input.category,
    note: input.note,
    date: "2026-09-02",
    sourceThreadId: "507f1f77bcf86cd799439011",
    sourceMessageId: input.sourceMessageId,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

const LUNCH_TEXT =
  "i spent 1017 for lunch but my share was 120 rest were for my friends";

describe("multi-expense integration (Batch 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createExpenseToolMock.mockReset();
  });

  it("handles lunch x3 + small talk + rapido with two creates and a grounded reply", async () => {
    createExpenseToolMock
      .mockResolvedValueOnce(
        mockCreatedExpense({
          id: "exp-lunch",
          amount: 120,
          category: "food",
          note: "lunch share",
          sourceMessageId: "msg-lunch-1",
        }),
      )
      .mockResolvedValueOnce(
        mockCreatedExpense({
          id: "exp-rapido",
          amount: 30,
          category: "transportation",
          note: "rapido",
          sourceMessageId: "msg-rapido",
        }),
      );

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenses: [
          {
            sourceMessageId: "msg-lunch-1",
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
      }),
    ]);

    const messageBatch = [
      {
        id: "msg-lunch-1",
        role: "user" as const,
        content: LUNCH_TEXT,
        createdAt: "2026-09-02T10:00:00.000Z",
      },
      {
        id: "msg-lunch-2",
        role: "user" as const,
        content: LUNCH_TEXT,
        createdAt: "2026-09-02T10:05:00.000Z",
      },
      {
        id: "msg-hi",
        role: "user" as const,
        content: "what up",
        createdAt: "2026-09-02T10:10:00.000Z",
      },
      {
        id: "msg-lunch-3",
        role: "user" as const,
        content: LUNCH_TEXT,
        createdAt: "2026-09-02T10:15:00.000Z",
      },
      {
        id: "msg-rapido",
        role: "user" as const,
        content: "i spent 30 for rapido today",
        createdAt: "2026-09-02T17:00:00.000Z",
      },
    ];

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch,
      recentMessages: [],
    });

    expect(result.extractedExpenses).toHaveLength(2);
    expect(result.createdExpenses).toHaveLength(2);
    expect(createExpenseToolMock).toHaveBeenCalledTimes(2);
    expect(result.assistantReply).toContain("₹120.00");
    expect(result.assistantReply).toContain("₹30.00");
    expect(result.assistantReply).not.toContain("1017");

    const watermark = computeLastProcessedMessageId({
      intent: "create_expense",
      messageBatch,
      skippedMessageIds: result.skippedMessageIds,
      extractedExpenses: result.extractedExpenses,
      createdExpenses: result.createdExpenses,
    });

    expect(watermark).toBe("msg-rapido");

    const replyContext = buildReplyContext({
      ...result,
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch,
      recentMessages: [],
    });

    expect(replyContext.outcome.outcome).toBe("expenses_created");
    expect(replyContext.recentUserMessage).toBe("");
    expect(replyContext.useDeterministicReply).toBe(true);
  });

  it("creates two expenses from one message with the same sourceMessageId", async () => {
    createExpenseToolMock
      .mockResolvedValueOnce(
        mockCreatedExpense({
          id: "exp-dinner",
          amount: 500,
          category: "food",
          note: "dinner",
          sourceMessageId: "msg-multi",
        }),
      )
      .mockResolvedValueOnce(
        mockCreatedExpense({
          id: "exp-rapido",
          amount: 30,
          category: "transportation",
          note: "rapido",
          sourceMessageId: "msg-multi",
        }),
      );

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
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
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "msg-multi",
          role: "user",
          content: "500 on dinner and 30 on rapido today",
        },
      ],
      recentMessages: [],
    });

    expect(result.createdExpenses).toHaveLength(2);
    expect(createExpenseToolMock.mock.calls.every(
      (call) => call[0]?.messageId === "msg-multi",
    )).toBe(true);
  });

  it("creates the complete expense and keeps the incomplete one for clarification", async () => {
    createExpenseToolMock.mockResolvedValueOnce(
      mockCreatedExpense({
        id: "exp-lunch",
        amount: 120,
        category: "food",
        note: "lunch share",
        sourceMessageId: "msg-lunch",
      }),
    );

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenses: [
          {
            sourceMessageId: "msg-lunch",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
          {
            sourceMessageId: "msg-metro",
            category: "transportation",
            note: "metro",
            missingFields: ["amount"],
          },
        ],
      }),
      async () => ({
        reply: "How much was the metro ride?",
      }),
    ]);

    const messageBatch = [
      {
        id: "msg-lunch",
        role: "user" as const,
        content: "my lunch share was 120",
      },
      {
        id: "msg-metro",
        role: "user" as const,
        content: "also took the metro",
      },
    ];

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch,
      recentMessages: [],
    });

    expect(result.createdExpenses).toHaveLength(1);
    expect(result.createdExpenses[0]?.amount).toBe(120);
    expect(createExpenseToolMock).toHaveBeenCalledOnce();

    const incompleteItem = result.extractedExpenses.find(
      (item) => item.sourceMessageId === "msg-metro",
    );
    expect(incompleteItem?.missingFields).toContain("amount");

    const persisted = resolvePersistedExpenseDraft({
      intent: "create_expense",
      defaultCurrency: "INR",
      expenseDraft: result.expenseDraft,
      missingFields: result.missingFields,
      extractedExpenses: result.extractedExpenses,
      createdExpensesCount: result.createdExpenses.length,
    });

    expect(persisted?.draft.category).toBe("transportation");
    expect(persisted?.missingFields).toEqual(["amount"]);

    const watermark = computeLastProcessedMessageId({
      intent: "create_expense",
      messageBatch,
      extractedExpenses: result.extractedExpenses,
      createdExpenses: result.createdExpenses,
    });

    expect(watermark).toBe("msg-metro");
  });

  it("dedupes duplicate lunch messages to a single create call", async () => {
    createExpenseToolMock.mockResolvedValueOnce(
      mockCreatedExpense({
        id: "exp-lunch",
        amount: 120,
        category: "food",
        note: "lunch share",
        sourceMessageId: "msg-lunch-1",
      }),
    );

    const provider = createSequentialProvider([
      async () => ({ intent: "create_expense" }),
      async () => ({
        expenses: [
          {
            sourceMessageId: "msg-lunch-1",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
          {
            sourceMessageId: "msg-lunch-2",
            amount: 120,
            category: "food",
            note: "lunch share",
            dateHint: "today",
          },
        ],
      }),
    ]);

    const graph = createFluxGraph(provider);
    const result = await graph.invoke({
      threadId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      defaultCurrency: "INR",
      messageBatch: [
        {
          id: "msg-lunch-1",
          role: "user",
          content: LUNCH_TEXT,
        },
        {
          id: "msg-lunch-2",
          role: "user",
          content: LUNCH_TEXT,
        },
      ],
      recentMessages: [],
    });

    expect(result.extractedExpenses).toHaveLength(1);
    expect(result.createdExpenses).toHaveLength(1);
    expect(createExpenseToolMock).toHaveBeenCalledOnce();
  });
});
