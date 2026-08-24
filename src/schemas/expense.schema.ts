import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Invalid date");

export const createExpenseSchema = z.object({
  amount: z
    .number({ error: "Amount must be a number" })
    .finite("Amount must be a finite number")
    .positive("Amount must be greater than 0"),
  category: z.string().trim().min(1, "Category is required").transform((value) =>
    value.toLowerCase(),
  ),
  note: z.string().trim().max(1000, "Note must be at most 1000 characters").default(""),
  date: dateOnlySchema,
});

export const updateExpenseSchema = z
  .object({
    amount: z
      .number({ error: "Amount must be a number" })
      .finite("Amount must be a finite number")
      .positive("Amount must be greater than 0")
      .optional(),
    category: z
      .string()
      .trim()
      .min(1, "Category is required")
      .transform((value) => value.toLowerCase())
      .optional(),
    note: z
      .string()
      .trim()
      .max(1000, "Note must be at most 1000 characters")
      .optional(),
    date: dateOnlySchema.optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.category !== undefined ||
      value.note !== undefined ||
      value.date !== undefined,
    { message: "At least one field must be provided" },
  );

export const expenseIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid expense ID"),
});

export const searchExpensesSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(1, "Category cannot be empty")
      .transform((value) => value.toLowerCase())
      .optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine(
    (value) => {
      if (value.from && value.to) {
        return value.from <= value.to;
      }
      return true;
    },
    {
      message: "Invalid date range: 'from' must be on or before 'to'",
      path: ["from"],
    },
  );

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
export type SearchExpensesInput = z.infer<typeof searchExpensesSchema>;
