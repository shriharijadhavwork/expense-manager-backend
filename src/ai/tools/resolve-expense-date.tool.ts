import { dateHintSchema, type DateHint } from "../schemas/date-hint.schema.js";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MESSAGE_DATE_PATTERNS: Array<{ pattern: RegExp; hint: DateHint }> = [
  { pattern: /\bday before yesterday\b/i, hint: "day_before_yesterday" },
  { pattern: /\byesterday\b/i, hint: "yesterday" },
  { pattern: /\btoday\b/i, hint: "today" },
  { pattern: /\blast week\b/i, hint: "last_week" },
  { pattern: /\bthis week\b/i, hint: "this_week" },
];

export type ResolveExpenseDateInput = {
  /** Anchor time — message `createdAt` when available, otherwise now (UTC). */
  referenceAt: Date;
  /** Absolute date from the model when already in YYYY-MM-DD form. */
  explicitDate?: string;
  /** Relative hint from the model (`today`, `yesterday`, etc.). */
  dateHint?: string;
  /** Raw user text scanned for relative date phrases when hint is absent. */
  messageText?: string;
};

function toUtcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseExplicitDate(value: string | undefined): string | undefined {
  if (!value || !DATE_ONLY_PATTERN.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toUtcDateOnly(parsed) !== value) {
    return undefined;
  }

  return value;
}

function parseDateHint(value: string | undefined): DateHint | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const parsed = dateHintSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function detectDateHintFromText(messageText: string | undefined): DateHint | undefined {
  if (!messageText?.trim()) {
    return undefined;
  }

  for (const entry of MESSAGE_DATE_PATTERNS) {
    if (entry.pattern.test(messageText)) {
      return entry.hint;
    }
  }

  return undefined;
}

function resolveHintToDate(hint: DateHint, referenceAt: Date): string {
  switch (hint) {
    case "today":
    case "this_week":
      return toUtcDateOnly(referenceAt);
    case "yesterday":
      return toUtcDateOnly(addUtcDays(referenceAt, -1));
    case "day_before_yesterday":
      return toUtcDateOnly(addUtcDays(referenceAt, -2));
    case "last_week":
      return toUtcDateOnly(addUtcDays(referenceAt, -7));
  }
}

/**
 * Deterministic expense-date resolver used after LLM extraction.
 * The model should emit `dateHint` for relative phrases; this tool applies UTC calendar math.
 */
export function resolveExpenseDate(input: ResolveExpenseDateInput): string {
  const explicitDate = parseExplicitDate(input.explicitDate);
  if (explicitDate) {
    return explicitDate;
  }

  const hint =
    parseDateHint(input.dateHint) ??
    detectDateHintFromText(input.messageText);

  if (hint) {
    return resolveHintToDate(hint, input.referenceAt);
  }

  return toUtcDateOnly(input.referenceAt);
}
