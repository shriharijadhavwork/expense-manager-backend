import { isValidTimezone } from "../constants/timezone.js";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Prefer an explicit IANA zone; treat `auto` / invalid as UTC for server-side day boundaries. */
export function resolveEffectiveTimezone(preference: string | undefined): string {
  if (!preference || preference === "auto") {
    return "UTC";
  }

  return isValidTimezone(preference) ? preference : "UTC";
}

/** Calendar day key `YYYY-MM-DD` in the given IANA timezone. */
export function getDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to compute dayKey");
  }

  return `${year}-${month}-${day}`;
}

/**
 * Display title from stored dayKey + sequence.
 * Example: dayKey `2026-08-26`, sequence `1` → `26 Aug 2026 · Thread 1`
 */
export function formatThreadTitle(dayKey: string, sequence: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    throw new Error(`Invalid dayKey: ${dayKey}`);
  }

  const year = match[1]!;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthLabel = MONTH_LABELS[monthIndex];

  if (!monthLabel || day < 1 || day > 31) {
    throw new Error(`Invalid dayKey: ${dayKey}`);
  }

  return `${day} ${monthLabel} ${year} · Thread ${sequence}`;
}
