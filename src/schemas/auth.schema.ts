import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Valid email is required").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.email("Valid email is required").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .email("Valid email is required")
    .transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, "Reset token is invalid"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
