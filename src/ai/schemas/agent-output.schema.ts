import { z } from "zod";

export const agentIntentSchema = z.enum([
  "create_expense",
  "update_expense",
  "query_expenses",
  "general_chat",
  "clarification",
  "unknown",
]);

export const expenseDraftSchema = z.object({
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  note: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().length(3).optional(),
});

export const agentOutputSchema = z.object({
  intent: agentIntentSchema,
  reply: z.string().min(1),
  expenseDraft: expenseDraftSchema.optional(),
  missingFields: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type AgentIntent = z.infer<typeof agentIntentSchema>;
export type ExpenseDraft = z.infer<typeof expenseDraftSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;
