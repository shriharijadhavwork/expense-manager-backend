export const DEFAULT_TIMEZONE_PREFERENCE = "auto";

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezonePreference(value: string | undefined): string {
  if (!value || value === "auto") {
    return DEFAULT_TIMEZONE_PREFERENCE;
  }

  return isValidTimezone(value) ? value : DEFAULT_TIMEZONE_PREFERENCE;
}
