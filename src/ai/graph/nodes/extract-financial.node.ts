import {
  EXTRACT_QUERY_SYSTEM_PROMPT,
  EXTRACT_UPDATE_SYSTEM_PROMPT,
} from "../../prompts/extract-query.prompt.js";
import { expenseQuerySchema } from "../../schemas/expense-query.schema.js";
import { expenseUpdateExtractionSchema } from "../../schemas/expense-update-extraction.schema.js";
import type { LlmProvider } from "../../types.js";
import { formatMessagesForPrompt, toChatMessages } from "../../utils/format-messages.js";
import type { FluxGraphState } from "../state.js";

function buildPromptContext(state: FluxGraphState): string {
  const context = formatMessagesForPrompt(state.recentMessages);
  const batch = formatMessagesForPrompt(state.messageBatch);

  return `Default currency: ${state.defaultCurrency}\n\nRecent messages:\n${context || "(none)"}\n\nLatest message batch:\n${batch}`;
}

export function createExtractQueryNode(provider: LlmProvider) {
  return async function extractQueryNode(
    state: FluxGraphState,
  ): Promise<Partial<FluxGraphState>> {
    if (state.error) {
      return {};
    }

    const result = await provider.generateStructured({
      system: EXTRACT_QUERY_SYSTEM_PROMPT,
      messages: toChatMessages([
        {
          id: "context",
          role: "system",
          content: buildPromptContext(state),
        },
        {
          id: "batch",
          role: "user",
          content: "Extract expense search filters.",
        },
      ]),
      schema: expenseQuerySchema,
      callSite: "extract_query",
    });

    return { expenseQuery: result };
  };
}

export function createExtractUpdateNode(provider: LlmProvider) {
  return async function extractUpdateNode(
    state: FluxGraphState,
  ): Promise<Partial<FluxGraphState>> {
    if (state.error) {
      return {};
    }

    const result = await provider.generateStructured({
      system: EXTRACT_UPDATE_SYSTEM_PROMPT,
      messages: toChatMessages([
        {
          id: "context",
          role: "system",
          content: buildPromptContext(state),
        },
        {
          id: "batch",
          role: "user",
          content: "Extract the expense update request.",
        },
      ]),
      schema: expenseUpdateExtractionSchema,
      callSite: "extract_update",
    });

    return { expenseUpdate: result };
  };
}
