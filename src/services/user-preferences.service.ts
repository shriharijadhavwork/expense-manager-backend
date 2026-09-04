import type { UserPreferencesDocument } from "../models/user-preferences.model.js";
import { userPreferencesRepository } from "../repositories/user-preferences.repository.js";
import type { UpdateMeInput } from "../schemas/user-preferences.schema.js";
import type { SafeUserPreferences } from "../types/auth.types.js";

function toSafeUserPreferences(
  preferences: UserPreferencesDocument,
): SafeUserPreferences {
  return {
    theme: preferences.theme,
    timezone: preferences.timezone,
    defaultCurrency: preferences.defaultCurrency,
    monthlyIncome: preferences.monthlyIncome ?? null,
  };
}

export const userPreferencesService = {
  async getForUser(userId: string): Promise<SafeUserPreferences> {
    const preferences = await userPreferencesRepository.getOrCreateForUser(userId);
    return toSafeUserPreferences(preferences);
  },

  async updateForUser(
    userId: string,
    input: UpdateMeInput,
  ): Promise<SafeUserPreferences> {
    const updates: {
      theme?: "light" | "dark" | "system";
      timezone?: string;
      defaultCurrency?: string;
      monthlyIncome?: number | null;
    } = {};

    if (input.preferences.theme !== undefined) {
      updates.theme = input.preferences.theme;
    }
    if (input.preferences.timezone !== undefined) {
      updates.timezone = input.preferences.timezone;
    }
    if (input.preferences.defaultCurrency !== undefined) {
      updates.defaultCurrency = input.preferences.defaultCurrency;
    }
    if (input.preferences.monthlyIncome !== undefined) {
      updates.monthlyIncome = input.preferences.monthlyIncome;
    }

    const preferences = await userPreferencesRepository.updateForUser(
      userId,
      updates,
    );

    if (!preferences) {
      const created = await userPreferencesRepository.getOrCreateForUser(userId);
      return toSafeUserPreferences(created);
    }

    return toSafeUserPreferences(preferences);
  },
};
