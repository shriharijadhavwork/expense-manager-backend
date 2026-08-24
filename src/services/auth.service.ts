import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository.js";
import {
  userPreferencesService,
} from "./user-preferences.service.js";
import type { AuthResult, SafeUser, SafeUserPreferences } from "../types/auth.types.js";
import type { LoginInput, SignupInput } from "../schemas/auth.schema.js";
import type { UpdateMeInput } from "../schemas/user-preferences.schema.js";
import { ApiError } from "../utils/api-error.js";
import { signAccessToken } from "../utils/jwt.js";
import type { UserDocument } from "../models/user.model.js";

const BCRYPT_ROUNDS = 12;

async function toSafeUser(user: UserDocument): Promise<SafeUser> {
  const preferences = await userPreferencesService.getForUser(String(user._id));

  return {
    id: String(user._id),
    name: String(user.name),
    email: String(user.email),
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
    });

    const token = signAccessToken(String(user._id));
    const safeUser = await toSafeUser(user);

    return {
      user: safeUser,
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
