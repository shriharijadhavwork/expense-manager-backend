import {
  assertValidEmail,
  extractEmail,
  formatMailAddress,
} from "./mail-address.js";
import type { MailAddress, MailMessage } from "./types.js";

const MAX_SUBJECT_LENGTH = 200;
const MAX_TEXT_LENGTH = 100_000;
const MAX_HTML_LENGTH = 200_000;
const MAX_RECIPIENTS = 50;

function normalizeAddress(address: MailAddress, field: string): MailAddress {
  if (typeof address === "string") {
    const email = address.trim().toLowerCase();
    assertValidEmail(email, field);
    return email;
  }

  const email = address.address.trim().toLowerCase();
  assertValidEmail(email, field);
  const name = address.name?.trim();

  return name ? { address: email, name } : email;
}

function normalizeTo(to: MailMessage["to"]): MailAddress[] {
  const list = Array.isArray(to) ? to : [to];

  if (list.length === 0) {
    throw new Error("MailMessage.to must include at least one recipient");
  }

  if (list.length > MAX_RECIPIENTS) {
    throw new Error(
      `MailMessage.to supports at most ${MAX_RECIPIENTS} recipients`,
    );
  }

  const normalized = list.map((address, index) =>
    normalizeAddress(address, `to[${index}]`),
  );

  const seen = new Set<string>();
  const unique: MailAddress[] = [];

  for (const address of normalized) {
    const key = extractEmail(address);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(address);
  }

  return unique;
}

/**
 * Validates and normalizes a message before it reaches any provider.
 * Throws Error on invalid input (callers may catch for soft-fail flows).
 */
export function normalizeMailMessage(message: MailMessage): MailMessage {
  const subject = message.subject.trim();
  if (!subject) {
    throw new Error("MailMessage.subject is required");
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `MailMessage.subject must be at most ${MAX_SUBJECT_LENGTH} characters`,
    );
  }

  const text = message.text.trim();
  if (!text) {
    throw new Error("MailMessage.text is required");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `MailMessage.text must be at most ${MAX_TEXT_LENGTH} characters`,
    );
  }

  let html: string | undefined;
  if (message.html !== undefined) {
    html = message.html.trim();
    if (!html) {
      throw new Error("MailMessage.html cannot be empty when provided");
    }
    if (html.length > MAX_HTML_LENGTH) {
      throw new Error(
        `MailMessage.html must be at most ${MAX_HTML_LENGTH} characters`,
      );
    }
  }

  const normalized: MailMessage = {
    to: normalizeTo(message.to),
    subject,
    text,
  };

  if (html !== undefined) {
    normalized.html = html;
  }

  if (message.replyTo !== undefined) {
    normalized.replyTo = normalizeAddress(message.replyTo, "replyTo");
  }

  if (message.headers !== undefined) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(message.headers)) {
      const headerName = key.trim();
      const headerValue = String(value).trim();
      if (!headerName || !headerValue) {
        throw new Error("MailMessage.headers entries must be non-empty");
      }
      headers[headerName] = headerValue;
    }
    normalized.headers = headers;
  }

  return normalized;
}

export function describeRecipients(to: MailMessage["to"]): string {
  const list = Array.isArray(to) ? to : [to];
  return list.map(formatMailAddress).join(", ");
}
