import { z } from "zod";

export const DEFAULT_CURRENCY = "INR";

/** ISO 4217 codes supported in the product UI and API validation. */
export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** BCP 47 locales used for Intl currency formatting (symbol placement, separators). */
export const CURRENCY_LOCALE: Record<SupportedCurrency, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
  JPY: "ja-JP",
  AUD: "en-AU",
  CAD: "en-CA",
  CHF: "de-CH",
};

const supportedSet = new Set<string>(SUPPORTED_CURRENCIES);

export function getLocaleForCurrency(currency: string): string {
  const normalized = normalizeCurrency(currency);
  return CURRENCY_LOCALE[normalized];
}

export const currencySchema = z
  .string()
  .trim()
  .length(3, "Currency must be a 3-letter ISO 4217 code")
  .transform((value) => value.toUpperCase())
  .refine((value) => supportedSet.has(value), {
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
  });

export function normalizeCurrency(value: string | undefined): SupportedCurrency {
  const parsed = currencySchema.safeParse(value ?? DEFAULT_CURRENCY);
  return parsed.success ? parsed.data : DEFAULT_CURRENCY;
}
