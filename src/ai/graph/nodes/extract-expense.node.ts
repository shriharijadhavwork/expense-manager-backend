import { EXTRACT_EXPENSE_SYSTEM_PROMPT } from "../../prompts/extract-expense.prompt.js";
import { expenseExtractionSchema } from "../../schemas/expense-extraction.schema.js";
import type { LlmProvider } from "../../types.js";
import {
  applyExpenseDefaults,
  getMissingExpenseFields,
} from "../../utils/expense-draft.js";
import { formatMessagesForPrompt, toChatMessages } from "../../utils/format-messages.js";
import {
  getReferenceDateFromMessages,
  joinMessageText,
} from "../../utils/message-reference-time.js";
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
    const messageText = joinMessageText(state.messageBatch);

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
      schema: expenseExtractionSchema,
      callSite: "extract_expense",
    });

    const mergedDraft = applyExpenseDefaults({
      draft: {
        ...state.persistedExpenseDraft,
        ...result.expenseDraft,
      },
      defaultCurrency: state.defaultCurrency,
      referenceAt,
      dateHint: result.dateHint,
      messageText,
    });

    const missingFields = getMissingExpenseFields(mergedDraft);

    return {
      expenseDraft: mergedDraft,
      missingFields,
    };
  };
}
