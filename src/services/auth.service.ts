import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository.js";
import {
  userPreferencesService,
} from "./user-preferences.service.js";
import { emailVerificationService } from "./email/email-verification.service.js";
import { passwordResetService } from "./email/password-reset.service.js";
import type { AuthResult, SafeUser, SafeUserPreferences } from "../types/auth.types.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from "../schemas/auth.schema.js";
import type { UpdateMeInput } from "../schemas/user-preferences.schema.js";
import { ApiError } from "../utils/api-error.js";
import { signAccessToken } from "../utils/jwt.js";
import type { UserDocument } from "../models/user.model.js";

const BCRYPT_ROUNDS = 12;

function resolveEmailVerified(user: UserDocument): boolean {
  return emailVerificationService.isEmailVerified(user);
}

async function toSafeUser(user: UserDocument): Promise<SafeUser> {
  const preferences = await userPreferencesService.getForUser(String(user._id));

  return {
    id: String(user._id),
    name: String(user.name),
    email: String(user.email),
    emailVerified: resolveEmailVerified(user),
    preferences,
  };
}

export const authService = {
  async signup(input: SignupInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const exists = await userRepository.existsByEmail(email);

    if (exists) {
      throw ApiError.conflict("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await userRepository.create({
      name: input.name,
      email,
      passwordHash,
      emailVerified: false,
    });

    await emailVerificationService.issueAndSendForNewUser(user);

    const token = signAccessToken(String(user._id));
    const safeUser = await toSafeUser(user);

    return {
      user: {
        ...safeUser,
        emailVerified: false,
      },
      token,
    };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const user = await userRepository.findByEmailWithPassword(email);

    const passwordHash =
      user && typeof user.passwordHash === "string" ? user.passwordHash : null;

    if (!user || passwordHash === null) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const isValid = await bcrypt.compare(input.password, passwordHash);

    if (!isValid) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const token = signAccessToken(String(user._id));
    const safeUser = await toSafeUser(user);

    return {
      user: safeUser,
      token,
    };
  },

  async getMe(userId: string): Promise<SafeUser> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw ApiError.unauthorized("User not found");
    }

    return toSafeUser(user);
  },

  async verifyEmail(
    userId: string,
    input: VerifyEmailInput,
  ): Promise<SafeUser> {
    const user = await emailVerificationService.verifyCode(userId, input.code);
    return toSafeUser(user);
  },

  async resendEmailOtp(userId: string): Promise<{ message: string }> {
    await emailVerificationService.issueAndSendForUser(userId);
    return {
      message: "If your email still needs verification, a new code was sent.",
    };
  },

  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    return passwordResetService.requestReset(input.email);
  },

  async resetPassword(
    input: ResetPasswordInput,
  ): Promise<{ message: string }> {
    return passwordResetService.resetPassword(input.token, input.newPassword);
  },

  async updateMe(
    userId: string,
    input: UpdateMeInput,
  ): Promise<SafeUserPreferences> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw ApiError.unauthorized("User not found");
    }

    return userPreferencesService.updateForUser(userId, input);
  },

  logout(): { message: string } {
    return {
      message:
        "Logged out. Discard the access token on the client. Server-side token revocation is not enabled in this version.",
    };
  },
};
