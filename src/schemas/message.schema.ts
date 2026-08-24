import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

export const createMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Content cannot be empty")
    .max(10000, "Content must be at most 10000 characters"),
  attachmentIds: z
    .array(z.string().regex(objectIdRegex, "Invalid attachment ID"))
    .optional(),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit must be at most 50")
    .optional(),
  before: z.string().regex(objectIdRegex, "Invalid cursor").optional(),
});

export const threadIdParamsSchema = z.object({
  id: z.string().regex(objectIdRegex, "Invalid thread ID"),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type ThreadIdParams = z.infer<typeof threadIdParamsSchema>;
