import { z } from "zod";

export const aiRunSchema = z.object({
  threadId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid thread ID"),
  messageBatch: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-f\d]{24}$/i, "Invalid message ID"),
        content: z.string().trim().min(1, "Message content is required"),
      }),
    )
    .min(1, "At least one message is required"),
});

export type AiRunInput = z.infer<typeof aiRunSchema>;

export const aiExecutionsQuerySchema = z.object({
  threadId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid thread ID"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AiExecutionsQuery = z.infer<typeof aiExecutionsQuerySchema>;
