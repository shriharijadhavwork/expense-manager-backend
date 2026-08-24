import {
  getLocaleForCurrency,
  normalizeCurrency,
  type SupportedCurrency,
} from "../constants/currency.js";

export type FormatCurrencyOptions = {
  /** BCP 47 locale override; defaults to the locale mapped for the currency. */
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

/**
 * Presentation payload for APIs and agentic flows.
 * Keeps raw numeric amount separate from grouped display text (no symbol).
 */
export type MoneyPresentation = {
  amount: number;
  currency: SupportedCurrency;
  /** Locale-grouped amount without currency symbol, e.g. "50,000" or "10.50". */
  formattedAmount: string;
  locale: string;
};

function fractionDigitsForAmount(
  amount: number,
  options: FormatCurrencyOptions,
): { maximumFractionDigits: number; minimumFractionDigits: number } {
  const hasFraction = Math.abs(amount % 1) > Number.EPSILON;

  return {
    maximumFractionDigits:
      options.maximumFractionDigits ?? (hasFraction ? 2 : 0),
    minimumFractionDigits:
      options.minimumFractionDigits ?? (hasFraction ? 2 : 0),
  };
}

/**
 * Formats a numeric amount with locale-aware grouping/separators for the given
 * currency. Does not include a currency symbol — combine with `currency` in UI.
 */
export function formatGroupedAmount(
  amount: number,
  currency: string,
  options: FormatCurrencyOptions = {},
): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Amount must be a finite number");
  }

  const normalized = normalizeCurrency(currency);
  const locale = options.locale ?? getLocaleForCurrency(normalized);
  const { maximumFractionDigits, minimumFractionDigits } = fractionDigitsForAmount(
    amount,
    options,
  );

  return new Intl.NumberFormat(locale, {
    style: "decimal",
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(amount);
}

/** @deprecated Use `formatGroupedAmount` — kept for existing imports. */
export const formatCurrencyAmount = formatGroupedAmount;

/**
 * Builds a structured money object for APIs and future agentic tooling.
 */
export function presentMoney(
  amount: number,
  currency: string,
  options: FormatCurrencyOptions = {},
): MoneyPresentation {
  const normalized = normalizeCurrency(currency);
  const locale = options.locale ?? getLocaleForCurrency(normalized);

  return {
    amount,
    currency: normalized,
    formattedAmount: formatGroupedAmount(amount, normalized, {
      ...options,
      locale,
    }),
    locale,
  };
}
