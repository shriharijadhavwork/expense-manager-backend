import { z } from "zod";

export const createThreadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(200, "Title must be at most 200 characters")
    .optional(),
});

export const updateThreadSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(200, "Title must be at most 200 characters")
      .optional(),
  })
  .refine((value) => value.title !== undefined, {
    message: "At least one field must be provided",
  });

export const markThreadReadSchema = z.object({
  readAt: z.string().datetime().optional(),
});

export const threadIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid thread ID"),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;
export type MarkThreadReadInput = z.infer<typeof markThreadReadSchema>;
export type ThreadIdParams = z.infer<typeof threadIdParamsSchema>;
