import { Annotation } from "@langchain/langgraph";
import type {
  SafeExpense,
  SpendingSummary,
} from "../../services/expense.service.js";
import type { ExpenseQuery } from "../schemas/expense-query.schema.js";
import type { ExpenseUpdateExtraction } from "../schemas/expense-update-extraction.schema.js";
import type { AgentIntent } from "../schemas/agent-output.schema.js";
import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import type { ExtractedExpenseItem } from "../utils/normalize-extracted-expenses.js";

export type SafeMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt?: string;
};

export type FluxGraphInput = {
  threadId: string;
  userId: string;
  defaultCurrency: string;
  messageBatch: SafeMessage[];
  recentMessages: SafeMessage[];
  persistedExpenseDraft?: ExpenseDraft;
  currentIntent?: AgentIntent;
};

export const FluxGraphAnnotation = Annotation.Root({
  threadId: Annotation<string>,
  userId: Annotation<string>,
  defaultCurrency: Annotation<string>,
  messageBatch: Annotation<SafeMessage[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  recentMessages: Annotation<SafeMessage[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  persistedExpenseDraft: Annotation<ExpenseDraft | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  currentIntent: Annotation<AgentIntent | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  intent: Annotation<AgentIntent | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  expenseDraft: Annotation<ExpenseDraft | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  missingFields: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  multipleExpensesDetected: Annotation<boolean | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  multipleExpenseCount: Annotation<number | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  extractedExpenses: Annotation<ExtractedExpenseItem[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  skippedMessageIds: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  sourceMessageId: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  createdExpense: Annotation<SafeExpense | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  createdExpenses: Annotation<SafeExpense[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  expenseQuery: Annotation<ExpenseQuery | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  queryResult: Annotation<SafeExpense[] | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  spendingSummary: Annotation<SpendingSummary | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  expenseUpdate: Annotation<ExpenseUpdateExtraction | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  updatedExpense: Annotation<SafeExpense | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  assistantReply: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  error: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

export type FluxGraphState = typeof FluxGraphAnnotation.State;
