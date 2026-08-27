import bcrypt from "bcrypt";
import { emailService } from "./email.service.js";
import {
  buildPasswordResetTemplate,
  buildPasswordResetUrl,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./templates/password-reset.js";
import { userRepository } from "../../repositories/user.repository.js";
import { ApiError } from "../../utils/api-error.js";

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_EXPIRES_MINUTES = 60;
const BCRYPT_ROUNDS = 12;

const GENERIC_FORGOT_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

export const passwordResetService = {
  async requestReset(emailInput: string): Promise<{ message: string }> {
    const email = emailInput.toLowerCase().trim();
    const user = await userRepository.findByEmail(email);

    // Always succeed — do not reveal whether the email is registered.
    if (!user) {
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const token = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await userRepository.setPasswordResetToken(String(user._id), {
      tokenHash: hashPasswordResetToken(token),
      expiresAt,
    });

    const resetUrl = buildPasswordResetUrl(token);
    const content = buildPasswordResetTemplate({
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_EXPIRES_MINUTES,
    });

    try {
      await emailService.send({
        to: user.email,
        subject: content.subject,
        text: content.text,
        ...(content.html !== undefined ? { html: content.html } : {}),
        headers: {
          "X-Entity-Ref": "password-reset",
        },
      });
    } catch (error) {
      console.error(
        `[auth] Failed to send password reset email to=${user.email}`,
        error,
      );
    }

    return { message: GENERIC_FORGOT_MESSAGE };
  },

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashPasswordResetToken(token);
    const user = await userRepository.findByPasswordResetTokenHash(tokenHash);

    if (!user || !user.passwordResetExpiresAt) {
      throw ApiError.badRequest("Reset link is invalid or has expired");
    }

    if (user.passwordResetExpiresAt.getTime() <= Date.now()) {
      await userRepository.clearPasswordResetToken(String(user._id));
      throw ApiError.badRequest("Reset link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await userRepository.updatePasswordAndClearReset(String(user._id), {
      passwordHash,
    });

    return {
      message: "Password updated. You can sign in with your new password.",
    };
  },
};
