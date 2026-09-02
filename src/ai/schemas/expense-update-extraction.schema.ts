import { z } from "zod";
import { updateExpenseSchema } from "../../schemas/expense.schema.js";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const expenseMatchSchema = z.object({
  category: z.string().trim().min(1).optional(),
  date: dateOnlySchema.optional(),
  amount: z.number().positive().optional(),
});

export const expenseUpdateExtractionSchema = z.object({
  expenseId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid expense ID")
    .optional(),
  match: expenseMatchSchema.optional(),
  updates: updateExpenseSchema,
});

export type ExpenseUpdateExtraction = z.infer<
  typeof expenseUpdateExtractionSchema
>;
