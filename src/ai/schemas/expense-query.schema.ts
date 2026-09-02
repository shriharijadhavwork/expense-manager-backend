import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const expenseQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  mode: z.enum(["list", "summary"]).default("summary"),
});

export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;
