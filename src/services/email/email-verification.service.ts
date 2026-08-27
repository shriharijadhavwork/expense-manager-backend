import { emailService } from "./email.service.js";
import {
  buildSignupOtpTemplate,
  generateOtpCode,
  hashOtpCode,
  otpCodesMatch,
} from "./templates/signup-otp.js";
import { userRepository } from "../../repositories/user.repository.js";
import { ApiError } from "../../utils/api-error.js";
import type { UserDocument } from "../../models/user.model.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_EXPIRES_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const RESEND_MAX_PER_WINDOW = 5;

function isEmailVerified(user: UserDocument): boolean {
  // Legacy users created before Batch E2 may omit the field.
  if (user.get("emailVerified") === undefined) {
    return true;
  }
  return user.emailVerified === true;
}

async function issueOtp(user: UserDocument): Promise<string> {
  const code = generateOtpCode(6);
  const now = new Date();

  let sendCount = user.emailOtpSendCount ?? 0;
  let sendWindowStartedAt = user.emailOtpSendWindowStartedAt ?? null;

  if (
    !sendWindowStartedAt ||
    now.getTime() - sendWindowStartedAt.getTime() >= RESEND_WINDOW_MS
  ) {
    sendCount = 0;
    sendWindowStartedAt = now;
  }

  if (sendCount >= RESEND_MAX_PER_WINDOW) {
    throw ApiError.badRequest(
      "Too many verification emails. Try again in about an hour.",
    );
  }

  if (
    user.emailOtpLastSentAt &&
    now.getTime() - user.emailOtpLastSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw ApiError.badRequest(
      "Please wait a minute before requesting another code.",
    );
  }

  await userRepository.updateEmailOtpState(String(user._id), {
    emailOtpHash: hashOtpCode(code),
    emailOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
    emailOtpAttempts: 0,
    emailOtpLastSentAt: now,
    emailOtpSendCount: sendCount + 1,
    emailOtpSendWindowStartedAt: sendWindowStartedAt,
  });

  return code;
}

async function sendOtpEmail(user: UserDocument, code: string): Promise<void> {
  const content = buildSignupOtpTemplate({
    name: user.name,
    code,
    expiresInMinutes: OTP_EXPIRES_MINUTES,
  });

  try {
    await emailService.send({
      to: user.email,
      subject: content.subject,
      text: content.text,
      ...(content.html !== undefined ? { html: content.html } : {}),
      headers: {
        "X-Entity-Ref": "signup-otp",
      },
    });
  } catch (error) {
    console.error(
      `[auth] Failed to send signup OTP to=${user.email}`,
      error,
    );
  }
}

export const emailVerificationService = {
  isEmailVerified,

  async issueAndSendForUser(userId: string): Promise<void> {
    const user = await userRepository.findByIdWithEmailOtp(userId);
    if (!user) {
      throw ApiError.unauthorized("User not found");
    }

    if (isEmailVerified(user)) {
      throw ApiError.badRequest("Email is already verified");
    }

    const code = await issueOtp(user);
    await sendOtpEmail(user, code);
  },

  async issueAndSendForNewUser(user: UserDocument): Promise<void> {
    const fresh =
      (await userRepository.findByIdWithEmailOtp(String(user._id))) ?? user;
    const code = await issueOtp(fresh);
    await sendOtpEmail(fresh, code);
  },

  async verifyCode(userId: string, code: string): Promise<UserDocument> {
    const user = await userRepository.findByIdWithEmailOtp(userId);
    if (!user) {
      throw ApiError.unauthorized("User not found");
    }

    if (isEmailVerified(user)) {
      return user;
    }

    if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
      throw ApiError.badRequest(
        "No active verification code. Request a new one.",
      );
    }

    if (user.emailOtpExpiresAt.getTime() <= Date.now()) {
      throw ApiError.badRequest(
        "Verification code has expired. Request a new one.",
      );
    }

    if ((user.emailOtpAttempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
      throw ApiError.badRequest(
        "Too many incorrect attempts. Request a new code.",
      );
    }

    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      throw ApiError.badRequest("Enter the 6-digit verification code");
    }

    if (!otpCodesMatch(normalized, user.emailOtpHash)) {
      await userRepository.incrementEmailOtpAttempts(userId);
      throw ApiError.badRequest("Invalid verification code");
    }

    const verified = await userRepository.markEmailVerified(userId);
    if (!verified) {
      throw ApiError.unauthorized("User not found");
    }

    return verified;
  },
};
