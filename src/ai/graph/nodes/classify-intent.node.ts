import { CLASSIFY_INTENT_SYSTEM_PROMPT } from "../../prompts/classify-intent.prompt.js";
import { intentClassificationSchema } from "../../schemas/intent-classification.schema.js";
import type { LlmProvider } from "../../types.js";
import { formatMessagesForPrompt, toChatMessages } from "../../utils/format-messages.js";
import type { FluxGraphState } from "../state.js";

export function createClassifyIntentNode(provider: LlmProvider) {
  return async function classifyIntentNode(
    state: FluxGraphState,
  ): Promise<Partial<FluxGraphState>> {
    if (state.error) {
      return {};
    }

    const context = formatMessagesForPrompt(state.recentMessages);
    const batch = formatMessagesForPrompt(state.messageBatch);

    const result = await provider.generateStructured({
      system: CLASSIFY_INTENT_SYSTEM_PROMPT,
      messages: toChatMessages([
        {
          id: "context",
          role: "system",
          content: `Default currency: ${state.defaultCurrency}\n\nRecent messages:\n${context || "(none)"}`,
        },
        {
          id: "batch",
          role: "user",
          content: `Latest message batch:\n${batch}`,
        },
      ]),
      schema: intentClassificationSchema,
      callSite: "classify_intent",
    });

    return { intent: result.intent };
  };
}
