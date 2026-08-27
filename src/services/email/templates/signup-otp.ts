import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { EMAIL_BRAND } from "../../../constants/brand.js";
import { env } from "../../../config/env.js";
import type { EmailTemplateContent } from "../types.js";
import {
  buildTransactionalEmail,
  htmlCode,
  htmlCta,
  htmlParagraph,
} from "./layout.js";

export type SignupOtpTemplateInput = {
  name: string;
  code: string;
  expiresInMinutes: number;
};

export function buildSignupOtpTemplate(
  input: SignupOtpTemplateInput,
): EmailTemplateContent {
  const name = input.name.trim() || "there";
  const verifyUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/verify-email`;

  return buildTransactionalEmail({
    subject: `Confirm your ${EMAIL_BRAND.appName} email`,
    greeting: `Hi ${name},`,
    textParagraphs: [
      `Your confirmation code is: ${input.code}`,
      "",
      `This code expires in ${input.expiresInMinutes} minutes.`,
      "",
      `Or open: ${verifyUrl}`,
    ],
    htmlBlocks: [
      htmlParagraph("Your confirmation code is:"),
      htmlCode(input.code),
      htmlParagraph(
        `This code expires in ${input.expiresInMinutes} minutes.`,
      ),
      htmlCta("Confirm email", verifyUrl),
    ],
    footerNote:
      "If you did not create an account, you can ignore this email.",
  });
}

export function generateOtpCode(length = 6): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function otpCodesMatch(plainCode: string, codeHash: string): boolean {
  const hashed = Buffer.from(hashOtpCode(plainCode), "utf8");
  const expected = Buffer.from(codeHash, "utf8");
  if (hashed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(hashed, expected);
}
