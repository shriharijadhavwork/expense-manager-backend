import { z } from "zod";
import { dateHintSchema } from "./date-hint.schema.js";
import { expenseDraftSchema } from "./agent-output.schema.js";

const looseExpenseExtractionSchema = z.object({
  expenseDraft: expenseDraftSchema.optional(),
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  note: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().length(3).optional(),
  dateHint: dateHintSchema.optional(),
  missingFields: z.array(z.string()).optional(),
});

export const expenseExtractionSchema = looseExpenseExtractionSchema.transform(
  (raw) => {
    const expenseDraft = expenseDraftSchema.parse({
      ...(raw.expenseDraft ?? {}),
      ...(raw.amount !== undefined ? { amount: raw.amount } : {}),
      ...(raw.category !== undefined ? { category: raw.category } : {}),
      ...(raw.note !== undefined ? { note: raw.note } : {}),
      ...(raw.date !== undefined ? { date: raw.date } : {}),
      ...(raw.currency !== undefined ? { currency: raw.currency } : {}),
    });

    return {
      expenseDraft,
      ...(raw.dateHint !== undefined ? { dateHint: raw.dateHint } : {}),
      ...(raw.missingFields !== undefined
        ? { missingFields: raw.missingFields }
        : {}),
    };
  },
);

export type ExpenseExtraction = z.infer<typeof expenseExtractionSchema>;
