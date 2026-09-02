import type { SafeExpense } from "../../services/expense.service.js";
import { ApiError } from "../../utils/api-error.js";
import { createFluxGraph } from "../graph/flux.graph.js";
import type { FluxGraphState } from "../graph/state.js";
import type { LlmProvider } from "../types.js";
import { aiExecutionService } from "./ai-execution.service.js";
import { aiService } from "./ai.service.js";
import { contextService } from "./context.service.js";
import type { SafeConversationAiState } from "../types/conversation-ai-state.js";
import type { ExtractedExpenseItem } from "../utils/normalize-extracted-expenses.js";

export type GraphRunInput = {
  userId: string;
  threadId: string;
  messageBatch: Array<{ id: string; content: string }>;
  aiState?: SafeConversationAiState;
  trigger?: "orchestrator" | "api_run";
};

export type GraphRunResult = {
  intent: FluxGraphState["intent"];
  expenseDraft: FluxGraphState["expenseDraft"];
  missingFields: string[];
  assistantReply: string;
  defaultCurrency: string;
  createdExpense?: SafeExpense;
  createdExpenses: SafeExpense[];
  extractedExpenses: ExtractedExpenseItem[];
  skippedMessageIds: string[];
  error?: string;
};

let graphProviderOverride: LlmProvider | null = null;

function resolveGraphProvider(): LlmProvider {
  if (graphProviderOverride) {
    return graphProviderOverride;
  }

  const provider = aiService.getProviderOrNull();
  if (!provider) {
    throw new ApiError(
      503,
      "INTERNAL_ERROR",
      "AI provider is not configured. Set GEMINI_API_KEY in .env",
    );
  }

  return provider;
}

async function invokeGraph(input: GraphRunInput): Promise<GraphRunResult> {
  const provider = resolveGraphProvider();
  const graph = createFluxGraph(provider);
  const context = await contextService.buildGraphContext(input);
  const result = await graph.invoke(context);

  const graphResult: GraphRunResult = {
    intent: result.intent,
    expenseDraft: result.expenseDraft,
    missingFields: result.missingFields,
    defaultCurrency: context.defaultCurrency,
    assistantReply:
      result.assistantReply ??
      "I could not generate a reply for that message.",
    createdExpenses: result.createdExpenses ?? [],
    extractedExpenses: result.extractedExpenses ?? [],
    skippedMessageIds: result.skippedMessageIds ?? [],
    ...(result.createdExpense
      ? { createdExpense: result.createdExpense }
      : result.createdExpenses?.[0]
        ? { createdExpense: result.createdExpenses[0] }
        : {}),
    ...(result.error ? { error: result.error } : {}),
  };

  aiExecutionService.annotateGraphResult({
    ...(graphResult.intent ? { intent: graphResult.intent } : {}),
    ...(graphResult.error ? { error: graphResult.error } : {}),
  });

  return graphResult;
}

export const graphRunnerService = {
  async run(input: GraphRunInput): Promise<GraphRunResult> {
    const trigger = input.trigger ?? "api_run";

    return aiExecutionService.runTracked(
      {
        userId: input.userId,
        threadId: input.threadId,
        messageIds: input.messageBatch.map((message) => message.id),
        trigger,
      },
      () => invokeGraph(input),
    );
  },

  /** Test helper — inject a mock provider for graph runs. */
  setProvider(provider: LlmProvider | null): void {
    graphProviderOverride = provider;
  },

  hasProviderOverride(): boolean {
    return graphProviderOverride !== null;
  },
};
