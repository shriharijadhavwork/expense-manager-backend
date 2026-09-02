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

function getCurrencySymbolParts(currency: string): {
  symbol: string;
  symbolFirst: boolean;
} {
  const normalized = normalizeCurrency(currency);
  const locale = getLocaleForCurrency(normalized);
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalized,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(1);

  const symbol =
    parts.find((part) => part.type === "currency")?.value ?? normalized;
  const symbolIndex = parts.findIndex((part) => part.type === "currency");
  const numberIndex = parts.findIndex((part) =>
    ["integer", "decimal", "fraction"].includes(part.type),
  );

  return {
    symbol,
    symbolFirst:
      symbolIndex >= 0 && numberIndex >= 0 && symbolIndex < numberIndex,
  };
}

/** Prefixes/suffixes grouped amount with the locale symbol for the currency. */
export function withCurrencySymbol(
  groupedAmount: string,
  currency: string,
): string {
  const { symbol, symbolFirst } = getCurrencySymbolParts(currency);

  if (symbolFirst) {
    return `${symbol}${groupedAmount}`;
  }

  return `${groupedAmount}\u00a0${symbol}`;
}

/** Display amount with symbol for chat replies and UI copy. */
export function formatDisplayAmount(
  amount: number,
  currency: string,
  options: FormatCurrencyOptions = {},
): string {
  const grouped = formatGroupedAmount(amount, currency, options);
  return withCurrencySymbol(grouped, currency);
}

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
