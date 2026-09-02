import { describe, expect, it } from "vitest";
import { computeLastProcessedMessageId } from "../src/ai/utils/compute-last-processed-message-id.js";

describe("computeLastProcessedMessageId", () => {
  it("advances to the last message for non create_expense intents", () => {
    expect(
      computeLastProcessedMessageId({
        intent: "general_chat",
        messageBatch: [
          { id: "m1", content: "hello" },
          { id: "m2", content: "what up" },
        ],
      }),
    ).toBe("m2");
  });

  it("advances through skipped non-expense messages", () => {
    expect(
      computeLastProcessedMessageId({
        intent: "create_expense",
        messageBatch: [
          { id: "m1", content: "what up" },
          {
            id: "m2",
            content: "i spent 30 for rapido today",
          },
        ],
        skippedMessageIds: ["m1"],
        extractedExpenses: [
          {
            draft: {
              amount: 30,
              category: "transportation",
              note: "rapido",
              date: "2026-09-02",
              currency: "INR",
            },
            sourceMessageId: "m2",
            missingFields: [],
          },
        ],
        createdExpenses: [
          {
            id: "e2",
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
        ],
      }),
    ).toBe("m2");
  });

  it("treats a clarification turn as handled for the message", () => {
    expect(
      computeLastProcessedMessageId({
        intent: "create_expense",
        messageBatch: [{ id: "m1", content: "Lunch was expensive" }],
        extractedExpenses: [
          {
            draft: { category: "food" },
            sourceMessageId: "m1",
            missingFields: ["amount"],
          },
        ],
        createdExpenses: [],
      }),
    ).toBe("m1");
  });

  it("stops before an unhandled expense message even if a later message was created", () => {
    expect(
      computeLastProcessedMessageId({
        intent: "create_expense",
        messageBatch: [
          {
            id: "m-lunch",
            content: "i spent 120 for lunch share",
          },
          { id: "m-hi", content: "what up" },
          {
            id: "m-rapido",
            content: "i spent 30 for rapido today",
          },
        ],
        skippedMessageIds: ["m-hi"],
        extractedExpenses: [
          {
            draft: {
              amount: 30,
              category: "transportation",
              note: "rapido",
              date: "2026-09-02",
              currency: "INR",
            },
            sourceMessageId: "m-rapido",
            missingFields: [],
          },
        ],
        createdExpenses: [
          {
            id: "e-rapido",
            userId: "u1",
            amount: 30,
            currency: "INR",
            formattedAmount: "₹30.00",
            category: "transportation",
            note: "rapido",
            date: "2026-09-02",
            sourceThreadId: "t1",
            sourceMessageId: "m-rapido",
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("marks duplicate expense messages as handled when the original was processed", () => {
    expect(
      computeLastProcessedMessageId({
        intent: "create_expense",
        messageBatch: [
          {
            id: "m-lunch-1",
            content: "i spent 120 for lunch share",
          },
          {
            id: "m-lunch-2",
            content: "i spent 120 for lunch share",
          },
          {
            id: "m-rapido",
            content: "i spent 30 for rapido today",
          },
        ],
        extractedExpenses: [
          {
            draft: {
              amount: 120,
              category: "food",
              note: "lunch share",
              date: "2026-09-02",
              currency: "INR",
            },
            sourceMessageId: "m-lunch-1",
            missingFields: [],
          },
          {
            draft: {
              amount: 30,
              category: "transportation",
              note: "rapido",
              date: "2026-09-02",
              currency: "INR",
            },
            sourceMessageId: "m-rapido",
            missingFields: [],
          },
        ],
        createdExpenses: [
          {
            id: "e-lunch",
            userId: "u1",
            amount: 120,
            currency: "INR",
            formattedAmount: "₹120.00",
            category: "food",
            note: "lunch share",
            date: "2026-09-02",
            sourceThreadId: "t1",
            sourceMessageId: "m-lunch-1",
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
          {
            id: "e-rapido",
            userId: "u1",
            amount: 30,
            currency: "INR",
            formattedAmount: "₹30.00",
            category: "transportation",
            note: "rapido",
            date: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
            sourceThreadId: "t1",
            sourceMessageId: "m-rapido",
            createdAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      }),
    ).toBe("m-rapido");
  });
});
