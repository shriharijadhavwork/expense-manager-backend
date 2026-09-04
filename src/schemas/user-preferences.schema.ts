import { z } from "zod";
import { currencySchema } from "../constants/currency.js";
import { isValidTimezone } from "../constants/timezone.js";
import { THEME_PREFERENCES } from "../constants/user-preferences.js";

export const timezonePreferenceSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine(
    (value) => value === "auto" || isValidTimezone(value),
    "Timezone must be 'auto' or a valid IANA timezone",
  );

/** Denominated in the user's `defaultCurrency`. `null` clears it (not configured). */
export const monthlyIncomeSchema = z
  .number({ error: "Monthly income must be a number" })
  .finite("Monthly income must be a finite number")
  .nonnegative("Monthly income cannot be negative")
  .nullable();

export const userPreferencesSchema = z.object({
  theme: z.enum(THEME_PREFERENCES),
  timezone: timezonePreferenceSchema,
  defaultCurrency: currencySchema,
  monthlyIncome: monthlyIncomeSchema,
});

export const updateMeSchema = z
  .object({
    preferences: z
      .object({
        theme: z.enum(THEME_PREFERENCES).optional(),
        timezone: timezonePreferenceSchema.optional(),
        defaultCurrency: currencySchema.optional(),
        monthlyIncome: monthlyIncomeSchema.optional(),
      })
      .refine(
        (value) =>
          value.theme !== undefined ||
          value.timezone !== undefined ||
          value.defaultCurrency !== undefined ||
          value.monthlyIncome !== undefined,
        { message: "At least one preference must be provided" },
      ),
  })
  .strict();

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
