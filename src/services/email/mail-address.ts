import type { MailAddress } from "./types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatMailAddress(address: MailAddress): string {
  if (typeof address === "string") {
    return address.trim();
  }

  const email = address.address.trim();
  const name = address.name?.trim();
  if (!name) {
    return email;
  }

  return `${name} <${email}>`;
}

export function extractEmail(address: MailAddress): string {
  if (typeof address === "string") {
    return address.trim().toLowerCase();
  }

  return address.address.trim().toLowerCase();
}

export function assertValidEmail(value: string, field: string): void {
  if (!EMAIL_RE.test(value)) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
}

/** Escape text for safe interpolation into HTML email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
