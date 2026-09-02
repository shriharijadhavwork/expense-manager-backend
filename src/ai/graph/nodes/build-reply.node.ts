import { aiConfig } from "../../config.js";
import { BUILD_REPLY_SYSTEM_PROMPT } from "../../prompts/build-reply.prompt.js";
import { createReplyGenerationSchema } from "../../schemas/reply-generation.schema.js";
import type { LlmProvider } from "../../types.js";
import {
  buildReplyContext,
  type ReplyContextPayload,
} from "../../utils/build-reply-context.js";
import { buildDeterministicReply } from "../../utils/build-reply-fallback.js";
import { formatMessagesForPrompt, toChatMessages } from "../../utils/format-messages.js";
import { sanitizeAssistantReply } from "../../utils/sanitize-assistant-reply.js";
import { aiLogger } from "../../observability/ai-logger.js";
import type { FluxGraphState } from "../state.js";

export function createBuildReplyNode(provider: LlmProvider) {
  return async function buildReplyNode(
    state: FluxGraphState,
  ): Promise<Partial<FluxGraphState>> {
    const replyContext = buildReplyContext(state);

    if (replyContext.useDeterministicReply) {
      const deterministic = buildDeterministicReply(state);
      aiLogger.info("ai_build_reply_generated", {
        intent: state.intent,
        outcome: replyContext.outcome.outcome,
        replyLength: deterministic.length,
        mode: "deterministic",
      });
      return { assistantReply: deterministic };
    }

    const generated = await generateReply(provider, state, replyContext);
    if (generated) {
      return { assistantReply: generated };
    }

    const fallback = buildDeterministicReply(state);
    aiLogger.info("ai_build_reply_used_fallback", {
      intent: state.intent,
      fallbackLength: fallback.length,
    });
    return { assistantReply: fallback };
  };
}

async function generateReply(
  provider: LlmProvider,
  state: FluxGraphState,
  replyContext: ReplyContextPayload,
): Promise<string | null> {
  try {
    const recent = formatMessagesForPrompt(state.recentMessages);
    const schema = createReplyGenerationSchema(aiConfig.replyMaxChars);
    const userPrompt = replyContext.recentUserMessage.trim()
      ? `User just said:\n${replyContext.recentUserMessage}\n\n${replyContext.instruction}`
      : replyContext.instruction;

    const result = await provider.generateStructured({
      system: BUILD_REPLY_SYSTEM_PROMPT,
      messages: toChatMessages([
        {
          id: "context",
          role: "system",
          content: `Intent: ${replyContext.intent}\nStructured outcome:\n${JSON.stringify(replyContext.outcome, null, 2)}\n\nRecent messages:\n${recent || "(none)"}`,
        },
        {
          id: "batch",
          role: "user",
          content: userPrompt,
        },
      ]),
      schema,
      callSite: "build_reply",
    });

    const sanitized = sanitizeAssistantReply(result.reply);
    if (!sanitized) {
      aiLogger.warn("ai_build_reply_empty", {
        intent: state.intent,
        outcome: replyContext.outcome.outcome,
      });
      return null;
    }

    aiLogger.info("ai_build_reply_generated", {
      intent: state.intent,
      outcome: replyContext.outcome.outcome,
      replyLength: sanitized.length,
      mode: "llm",
    });

    if (aiConfig.logLlmPayloads) {
      aiLogger.debug("ai_build_reply_text", {
        intent: state.intent,
        outcome: replyContext.outcome.outcome,
        reply: sanitized,
      });
    }

    return sanitized;
  } catch (error) {
    aiLogger.warn("ai_build_reply_fallback", {
      intent: state.intent,
      outcome: replyContext.outcome.outcome,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
