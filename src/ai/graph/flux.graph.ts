import { END, START, StateGraph } from "@langchain/langgraph";
import type { LlmProvider } from "../types.js";
import { aiExecutionService } from "../services/ai-execution.service.js";
import { createClassifyIntentNode } from "./nodes/classify-intent.node.js";
import { createExpenseNode } from "./nodes/create-expense.node.js";
import {
  createExtractQueryNode,
  createExtractUpdateNode,
} from "./nodes/extract-financial.node.js";
import { createExtractExpenseNode } from "./nodes/extract-expense.node.js";
import { buildReplyNode } from "./nodes/build-reply.node.js";
import { loadContextNode } from "./nodes/load-context.node.js";
import { queryExpensesNode } from "./nodes/query-expenses.node.js";
import { updateExpenseNode } from "./nodes/update-expense.node.js";
import { FluxGraphAnnotation, type FluxGraphState } from "./state.js";
import { isExpenseDraftComplete } from "../utils/expense-draft.js";

type AfterIntentRoute =
  | "extract_expense"
  | "extract_query"
  | "extract_update"
  | "build_reply";

function routeAfterIntent(state: FluxGraphState): AfterIntentRoute {
  if (state.error) {
    return "build_reply";
  }

  switch (state.intent) {
    case "create_expense":
      return "extract_expense";
    case "query_expenses":
      return "extract_query";
    case "update_expense":
      return "extract_update";
    default:
      return "build_reply";
  }
}

function routeAfterExtract(
  state: FluxGraphState,
): "create_expense" | "build_reply" {
  if (state.error) {
    return "build_reply";
  }

  if (
    state.intent === "create_expense" &&
    isExpenseDraftComplete(state.expenseDraft, state.defaultCurrency)
  ) {
    return "create_expense";
  }

  return "build_reply";
}

function wrapNode<T extends Partial<FluxGraphState>>(
  nodeName: string,
  handler: (state: FluxGraphState) => Promise<T>,
) {
  return (state: FluxGraphState) =>
    aiExecutionService.withNodeSpan(
      nodeName,
      () => handler(state),
      (partial) => !partial.error,
    );
}

export function createFluxGraph(provider: LlmProvider) {
  const classifyIntent = createClassifyIntentNode(provider);
  const extractExpense = createExtractExpenseNode(provider);
  const extractQuery = createExtractQueryNode(provider);
  const extractUpdate = createExtractUpdateNode(provider);

  return new StateGraph(FluxGraphAnnotation)
    .addNode("load_context", wrapNode("load_context", loadContextNode))
    .addNode("classify_intent", wrapNode("classify_intent", classifyIntent))
    .addNode("extract_expense", wrapNode("extract_expense", extractExpense))
    .addNode("extract_query", wrapNode("extract_query", extractQuery))
    .addNode("extract_update", wrapNode("extract_update", extractUpdate))
    .addNode("create_expense", wrapNode("create_expense", createExpenseNode))
    .addNode("query_expenses", wrapNode("query_expenses", queryExpensesNode))
    .addNode("update_expense", wrapNode("update_expense", updateExpenseNode))
    .addNode("build_reply", wrapNode("build_reply", buildReplyNode))
    .addEdge(START, "load_context")
    .addEdge("load_context", "classify_intent")
    .addConditionalEdges("classify_intent", routeAfterIntent, {
      extract_expense: "extract_expense",
      extract_query: "extract_query",
      extract_update: "extract_update",
      build_reply: "build_reply",
    })
    .addConditionalEdges("extract_expense", routeAfterExtract, {
      create_expense: "create_expense",
      build_reply: "build_reply",
    })
    .addEdge("extract_query", "query_expenses")
    .addEdge("query_expenses", "build_reply")
    .addEdge("extract_update", "update_expense")
    .addEdge("update_expense", "build_reply")
    .addEdge("create_expense", "build_reply")
    .addEdge("build_reply", END)
    .compile();
}

export type FluxGraph = ReturnType<typeof createFluxGraph>;
