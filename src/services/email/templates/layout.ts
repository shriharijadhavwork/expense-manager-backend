import { EMAIL_BRAND } from "../../../constants/brand.js";
import { escapeHtml } from "../mail-address.js";
import type { EmailTemplateContent } from "../types.js";

export type TransactionalEmailInput = {
  subject: string;
  /** Plain-text greeting line without trailing punctuation, e.g. "Hi Alice". */
  greeting?: string;
  /** Plain-text body paragraphs (empty string = blank line). */
  textParagraphs: string[];
  /** Pre-escaped or safely built HTML blocks for the main body (not including footer). */
  htmlBlocks: string[];
  footerNote: string;
  /** When true (default), append the Flux tagline under the footer note. */
  includeBrandTagline?: boolean;
};

/**
 * Shared transactional email shell — every product email should use this so
 * text + HTML stay paired and visually consistent.
 */
export function buildTransactionalEmail(
  input: TransactionalEmailInput,
): EmailTemplateContent {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("Email subject is required");
  }

  const includeBrandTagline = input.includeBrandTagline !== false;
  const textParts: string[] = [];
  if (input.greeting?.trim()) {
    textParts.push(input.greeting.trim(), "");
  }
  for (const paragraph of input.textParagraphs) {
    textParts.push(paragraph);
  }
  if (input.footerNote.trim()) {
    textParts.push("", input.footerNote.trim());
  }
  if (includeBrandTagline) {
    textParts.push("", `${EMAIL_BRAND.appName} — ${EMAIL_BRAND.tagline}`);
  }

  const safeFooter = escapeHtml(input.footerNote.trim());
  const safeTagline = escapeHtml(
    `${EMAIL_BRAND.appName} — ${EMAIL_BRAND.tagline}`,
  );
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:560px">`,
    `<p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 16px">${escapeHtml(EMAIL_BRAND.appName)}</p>`,
    input.greeting?.trim()
      ? `<p>${escapeHtml(input.greeting.trim())}</p>`
      : "",
    ...input.htmlBlocks,
    safeFooter
      ? `<p style="color:#666;font-size:12px;margin-top:24px">${safeFooter}</p>`
      : "",
    includeBrandTagline
      ? `<p style="font-family:Georgia,'Times New Roman',serif;color:#666;font-size:12px;margin-top:8px">${safeTagline}</p>`
      : "",
    `</div>`,
  ]
    .filter(Boolean)
    .join("");

  return {
    subject,
    text: textParts.join("\n"),
    html,
  };
}

export function htmlParagraph(content: string): string {
  return `<p>${content}</p>`;
}

export function htmlMuted(content: string): string {
  return `<p style="color:#666;font-size:12px">${content}</p>`;
}

export function htmlCta(label: string, url: string): string {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  return `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${safeLabel}</a></p>${htmlMuted(`Or paste this URL into your browser:<br>${safeUrl}`)}`;
}

export function htmlCode(code: string): string {
  const safe = escapeHtml(code);
  return `<p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${safe}</p>`;
}
