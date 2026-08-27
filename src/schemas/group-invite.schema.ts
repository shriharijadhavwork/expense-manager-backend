import { z } from "zod";

export const createGroupInviteSchema = z.object({
  email: z
    .email("Valid email is required")
    .transform((value) => value.toLowerCase()),
});

export const inviteTokenParamsSchema = z.object({
  token: z.string().trim().min(16, "Invalid invite token"),
});

export const groupInviteIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid group ID"),
  inviteId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid invite ID"),
});

export type CreateGroupInviteInput = z.infer<typeof createGroupInviteSchema>;
export type InviteTokenParams = z.infer<typeof inviteTokenParamsSchema>;
export type GroupInviteIdParams = z.infer<typeof groupInviteIdParamsSchema>;
