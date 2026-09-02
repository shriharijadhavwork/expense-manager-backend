import { z } from "zod";
import { dateHintSchema } from "./date-hint.schema.js";
import { expenseDraftSchema } from "./agent-output.schema.js";

const rawExpenseItemSchema = z.object({
  sourceMessageId: z.string().min(1).optional(),
  expenseDraft: expenseDraftSchema.optional(),
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  subCategory: z.string().trim().max(100).optional(),
  direction: z.enum(["debit", "credit"]).optional(),
  note: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().length(3).optional(),
  dateHint: dateHintSchema.optional(),
  missingFields: z.array(z.string()).optional(),
});

const looseExpenseExtractionsSchema = z.object({
  expenses: z.array(rawExpenseItemSchema).default([]),
  skippedMessageIds: z.array(z.string().min(1)).optional(),
});

function isLegacySingleExpense(value: Record<string, unknown>): boolean {
  return (
    value["expenses"] === undefined &&
    (value["expenseDraft"] !== undefined ||
      value["amount"] !== undefined ||
      value["category"] !== undefined)
  );
}

function normalizeExpenseExtractionsInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { expenses: value };
  }

  if (typeof value !== "object" || value === null) {
    return { expenses: [] };
  }

  const record = value as Record<string, unknown>;

  if (isLegacySingleExpense(record)) {
    return { expenses: [record] };
  }

  return record;
}

function parseExpenseItem(raw: z.infer<typeof rawExpenseItemSchema>) {
  const expenseDraft = expenseDraftSchema.parse({
    ...(raw.expenseDraft ?? {}),
    ...(raw.amount !== undefined ? { amount: raw.amount } : {}),
    ...(raw.category !== undefined ? { category: raw.category } : {}),
    ...(raw.subCategory !== undefined ? { subCategory: raw.subCategory } : {}),
    ...(raw.direction !== undefined ? { direction: raw.direction } : {}),
    ...(raw.note !== undefined ? { note: raw.note } : {}),
    ...(raw.date !== undefined ? { date: raw.date } : {}),
    ...(raw.currency !== undefined ? { currency: raw.currency } : {}),
  });

  return {
    expenseDraft,
    ...(raw.sourceMessageId ? { sourceMessageId: raw.sourceMessageId } : {}),
    ...(raw.dateHint !== undefined ? { dateHint: raw.dateHint } : {}),
    ...(raw.missingFields !== undefined
      ? { missingFields: raw.missingFields }
      : {}),
  };
}

export const expenseExtractionsSchema = z
  .preprocess(normalizeExpenseExtractionsInput, looseExpenseExtractionsSchema)
  .transform((raw) => ({
    expenses: raw.expenses.map(parseExpenseItem),
    skippedMessageIds: raw.skippedMessageIds ?? [],
  }));

export type ParsedExpenseExtractionItem = z.infer<
  typeof expenseExtractionsSchema
>["expenses"][number];

export type ExpenseExtractionsResult = z.infer<typeof expenseExtractionsSchema>;
