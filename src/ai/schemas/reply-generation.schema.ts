import { z } from "zod";

export function createReplyGenerationSchema(maxChars: number) {
  return z.object({
    reply: z.string().trim().min(1).max(maxChars),
  });
}

export const replyGenerationSchema = createReplyGenerationSchema(500);

export type ReplyGeneration = z.infer<typeof replyGenerationSchema>;
