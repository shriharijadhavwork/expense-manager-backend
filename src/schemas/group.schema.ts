import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid user ID");

const emailSchema = z
  .string()
  .trim()
  .email("Valid email is required")
  .transform((value) => value.toLowerCase());

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be at most 120 characters"),
  memberIds: z.array(objectIdSchema).max(50).default([]),
  emails: z.array(emailSchema).max(50).default([]),
});

export const updateGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name cannot be empty")
      .max(120, "Name must be at most 120 characters")
      .optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: "At least one field must be provided",
  });

export const groupIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid group ID"),
});

export const groupMemberParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid group ID"),
  userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user ID"),
});

export const addGroupMemberSchema = z
  .object({
    email: emailSchema.optional(),
    userId: objectIdSchema.optional(),
  })
  .refine((value) => Boolean(value.email) !== Boolean(value.userId), {
    message: "Provide exactly one of email or userId",
  });

export const transferGroupOwnershipSchema = z.object({
  userId: objectIdSchema,
});

export const resolveGroupSchema = z
  .object({
    emails: z.array(emailSchema).max(50).default([]),
    memberIds: z.array(objectIdSchema).max(50).default([]),
    name: z
      .string()
      .trim()
      .min(1, "Name cannot be empty")
      .max(120, "Name must be at most 120 characters")
      .optional(),
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(200, "Title must be at most 200 characters")
      .optional(),
  })
  .refine((value) => value.emails.length + value.memberIds.length >= 1, {
    message: "At least one email or memberId is required",
  });

export const createGroupThreadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(200, "Title must be at most 200 characters")
    .optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
export type GroupMemberParams = z.infer<typeof groupMemberParamsSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type TransferGroupOwnershipInput = z.infer<
  typeof transferGroupOwnershipSchema
>;
export type ResolveGroupInput = z.infer<typeof resolveGroupSchema>;
export type CreateGroupThreadInput = z.infer<typeof createGroupThreadSchema>;
