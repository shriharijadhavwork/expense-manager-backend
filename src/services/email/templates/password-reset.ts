import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EMAIL_BRAND } from "../../../constants/brand.js";
import { env } from "../../../config/env.js";
import type { EmailTemplateContent } from "../types.js";
import {
  buildTransactionalEmail,
  htmlCta,
  htmlParagraph,
} from "./layout.js";

export type PasswordResetTemplateInput = {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export function buildPasswordResetTemplate(
  input: PasswordResetTemplateInput,
): EmailTemplateContent {
  const name = input.name.trim() || "there";

  return buildTransactionalEmail({
    subject: `Reset your ${EMAIL_BRAND.appName} password`,
    greeting: `Hi ${name},`,
    textParagraphs: [
      `We received a request to reset your ${EMAIL_BRAND.appName} password.`,
      "",
      "Open this link to choose a new password:",
      input.resetUrl,
      "",
      `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
    ],
    htmlBlocks: [
      htmlParagraph(
        `We received a request to reset your ${EMAIL_BRAND.appName} password.`,
      ),
      htmlCta("Reset password", input.resetUrl),
      htmlParagraph(
        `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      ),
    ],
    footerNote:
      "If you did not request a reset, you can ignore this email.",
  });
}

export function buildPasswordResetUrl(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function passwordResetTokensMatch(
  plainToken: string,
  tokenHash: string,
): boolean {
  const hashed = Buffer.from(hashPasswordResetToken(plainToken), "utf8");
  const expected = Buffer.from(tokenHash, "utf8");
  if (hashed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(hashed, expected);
}
