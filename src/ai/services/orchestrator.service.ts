import { aiConfig } from "../config.js";
import { conversationAiStateService } from "./conversation-ai-state.service.js";
import { graphRunnerService } from "./graph-runner.service.js";
import { aiLogger } from "../observability/ai-logger.js";
import { messageService } from "../../services/message.service.js";

export type OrchestratorTurnInput = {
  threadId: string;
  userId: string;
  messageBatch: Array<{ id: string; content: string }>;
};

export const orchestratorService = {
  async processTurn(input: OrchestratorTurnInput): Promise<void> {
    if (!aiConfig.isConfigured() && !graphRunnerService.hasProviderOverride()) {
      return;
    }

    try {
      const aiState = await conversationAiStateService.getOrCreate(
        input.threadId,
        input.userId,
      );

      const messageBatch = await conversationAiStateService.resolveMessageBatch({
        threadId: input.threadId,
        userId: input.userId,
        debouncedMessages: input.messageBatch,
        ...(aiState.lastProcessedMessageId
          ? { lastProcessedMessageId: aiState.lastProcessedMessageId }
          : {}),
      });

      if (messageBatch.length === 0) {
        return;
      }

      const result = await graphRunnerService.run({
        userId: input.userId,
        threadId: input.threadId,
        messageBatch,
        aiState,
        trigger: "orchestrator",
      });

      if (!result.assistantReply.trim()) {
        return;
      }

      const expenseIds = result.createdExpense
        ? [result.createdExpense.id]
        : undefined;

      await messageService.createAssistant(
        input.userId,
        input.threadId,
        result.assistantReply,
        expenseIds,
      );

      const updatedState = await conversationAiStateService.recordSuccessfulTurn(
        {
          threadId: input.threadId,
          userId: input.userId,
          aiState,
          messageBatch,
          result,
        },
      );

      if (!updatedState) {
        aiLogger.warn("ai_state_persist_failed", {
          threadId: input.threadId,
          userId: input.userId,
        });
      }
    } catch (error) {
      aiLogger.error("ai_orchestrator_failed", {
        threadId: input.threadId,
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
