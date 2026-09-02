import type { AgentIntent } from "../schemas/agent-output.schema.js";
import type { ExpenseDraft } from "../schemas/agent-output.schema.js";
import type { ExtractedExpenseItem } from "../utils/normalize-extracted-expenses.js";

export type SafeConversationAiState = {
  threadId: string;
  userId: string;
  currentIntent?: AgentIntent;
  expenseDraft?: ExpenseDraft;
  missingRequiredFields?: string[];
  lastProcessedMessageId?: string;
  lastProcessedAt?: string;
  summary?: string;
  version: number;
};

export type RecordTurnResult = {
  intent?: AgentIntent;
  expenseDraft?: ExpenseDraft;
  missingFields: string[];
  defaultCurrency: string;
  createdExpense?: { id: string };
  createdExpenses?: Array<{
    id: string;
    sourceMessageId?: string;
    amount?: number;
    category?: string;
    note?: string;
  }>;
  extractedExpenses?: ExtractedExpenseItem[];
  skippedMessageIds?: string[];
};
