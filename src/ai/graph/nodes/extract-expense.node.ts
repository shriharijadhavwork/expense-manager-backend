import { EXTRACT_EXPENSE_SYSTEM_PROMPT } from "../../prompts/extract-expense.prompt.js";
import { expenseExtractionsSchema } from "../../schemas/expense-extractions.schema.js";
import type { LlmProvider } from "../../types.js";
import { formatMessagesForPrompt, toChatMessages } from "../../utils/format-messages.js";
import {
  getReferenceDateFromMessages,
} from "../../utils/message-reference-time.js";
import {
  normalizeExtractedExpenses,
  pickPrimaryExtractedExpense,
} from "../../utils/normalize-extracted-expenses.js";
import type { FluxGraphState } from "../state.js";

export function createExtractExpenseNode(provider: LlmProvider) {
  return async function extractExpenseNode(
    state: FluxGraphState,
  ): Promise<Partial<FluxGraphState>> {
    if (state.error) {
      return {};
    }

    const context = formatMessagesForPrompt(state.recentMessages);
    const batch = formatMessagesForPrompt(state.messageBatch);
    const existingDraft = state.persistedExpenseDraft
      ? JSON.stringify(state.persistedExpenseDraft)
      : "none";
    const referenceAt = getReferenceDateFromMessages(state.messageBatch);

    const result = await provider.generateStructured({
      system: EXTRACT_EXPENSE_SYSTEM_PROMPT,
      messages: toChatMessages([
        {
          id: "context",
          role: "system",
          content: `Default currency: ${state.defaultCurrency}\nReference message time (UTC): ${referenceAt.toISOString()}\nExisting expense draft: ${existingDraft}\n\nRecent messages:\n${context || "(none)"}`,
        },
        {
          id: "batch",
          role: "user",
          content: `Extract expense details from:\n${batch}`,
        },
      ]),
      schema: expenseExtractionsSchema,
      callSite: "extract_expense",
    });

    const normalized = normalizeExtractedExpenses({
      raw: result,
      messageBatch: state.messageBatch,
      defaultCurrency: state.defaultCurrency,
      ...(state.persistedExpenseDraft
        ? { persistedExpenseDraft: state.persistedExpenseDraft }
        : {}),
    });

    const primary = pickPrimaryExtractedExpense(normalized.items);

    return {
      extractedExpenses: normalized.items,
      skippedMessageIds: normalized.skippedMessageIds,
      ...(primary
        ? {
            expenseDraft: primary.draft,
            missingFields: primary.missingFields,
            sourceMessageId: primary.sourceMessageId,
          }
        : {
            expenseDraft: undefined,
            missingFields: [],
          }),
      ...(normalized.items.length > 1
        ? {
            multipleExpensesDetected: true,
            multipleExpenseCount: normalized.items.length,
          }
        : {}),
    };
  };
}
