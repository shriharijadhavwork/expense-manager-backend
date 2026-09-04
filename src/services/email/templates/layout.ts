import { EMAIL_BRAND } from "../../../constants/brand.js";
import { escapeHtml } from "../mail-address.js";
import type { EmailTemplateContent } from "../types.js";

/** Email-safe sans stack — no custom web fonts (unreliable across clients). */
const FONT_STACK =
  "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const MONO_STACK =
  "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

/** Mercury palette, hardcoded — email HTML can't read CSS custom properties. */
const COLOR = {
  pageBg: "#f7f7fb",
  cardBg: "#ffffff",
  cardBorder: "#eef0f6",
  text: "#16161f",
  muted: "#6b6b78",
  faint: "#9a9aa6",
  accent: "#5266eb",
  accentSoft: "#f2f3fd",
  accentSoftBorder: "#dde1fa",
} as const;

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
  /**
   * Hidden inbox preview text (the line shown next to the subject in most
   * clients). Defaults to the first non-empty text paragraph, truncated.
   */
  preheader?: string;
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

  const safeAppName = escapeHtml(EMAIL_BRAND.appName);
  const safeFooter = escapeHtml(input.footerNote.trim());
  const safeTagline = escapeHtml(
    `${EMAIL_BRAND.appName} — ${EMAIL_BRAND.tagline}`,
  );
  const preheaderSource =
    input.preheader?.trim() ||
    input.textParagraphs.find((line) => line.trim())?.trim() ||
    "";
  const safePreheader = escapeHtml(preheaderSource.slice(0, 140));

  const greetingBlock = input.greeting?.trim()
    ? `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLOR.text}">${escapeHtml(input.greeting.trim())}</p>`
    : "";

  const html = [
    // Hidden inbox preview text, padded so trailing template markup never
    // leaks into the preview line.
    safePreheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${safePreheader}${"&#8199;".repeat(80)}</div>`
      : "",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.pageBg};margin:0;padding:0">`,
    `<tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${COLOR.cardBg};border:1px solid ${COLOR.cardBorder};border-radius:16px">`,
    // Header — brand mark
    `<tr><td style="padding:36px 40px 4px">`,
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${COLOR.accent};margin-right:8px;vertical-align:middle"></span>`,
    `<span style="font-family:${FONT_STACK};font-size:19px;font-weight:700;letter-spacing:-0.01em;color:${COLOR.text};vertical-align:middle">${safeAppName}</span>`,
    `</td></tr>`,
    // Body
    `<tr><td style="padding:20px 40px 36px">`,
    greetingBlock,
    ...input.htmlBlocks,
    `</td></tr>`,
    // Footer
    safeFooter || includeBrandTagline
      ? [
          `<tr><td style="padding:24px 40px 32px;border-top:1px solid ${COLOR.cardBorder}">`,
          safeFooter
            ? `<p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${COLOR.muted}">${safeFooter}</p>`
            : "",
          includeBrandTagline
            ? `<p style="margin:${safeFooter ? "8px" : "0"} 0 0;font-family:${FONT_STACK};font-size:12px;color:${COLOR.faint}">${safeTagline}</p>`
            : "",
          `</td></tr>`,
        ].join("")
      : "",
    `</table>`,
    `</td></tr>`,
    `</table>`,
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
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLOR.text}">${content}</p>`;
}

export function htmlMuted(content: string): string {
  return `<p style="margin:8px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${COLOR.muted}">${content}</p>`;
}

/** Bulletproof table-based button — plain `<a>` padding/radius is unreliable in Outlook. */
export function htmlCta(label: string, url: string): string {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  const button = [
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px">`,
    `<tr><td style="border-radius:999px;background-color:${COLOR.accent}">`,
    `<a href="${safeUrl}" style="display:inline-block;padding:12px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${safeLabel}</a>`,
    `</td></tr>`,
    `</table>`,
  ].join("");

  return `${button}${htmlMuted(`Or paste this URL into your browser:<br>${safeUrl}`)}`;
}

/** OTP code — a bordered, tinted chip rather than bare bold text. */
export function htmlCode(code: string): string {
  const safe = escapeHtml(code);
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px">`,
    `<tr><td style="background-color:${COLOR.accentSoft};border:1px solid ${COLOR.accentSoftBorder};border-radius:12px;padding:16px 28px">`,
    `<span style="font-family:${MONO_STACK};font-size:28px;font-weight:700;letter-spacing:0.35em;color:${COLOR.text}">${safe}</span>`,
    `</td></tr>`,
    `</table>`,
  ].join("");
}
