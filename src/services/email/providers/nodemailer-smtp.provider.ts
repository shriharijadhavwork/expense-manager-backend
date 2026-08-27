import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../../config/env.js";
import { formatMailAddress } from "../mail-address.js";
import type { EmailProvider, MailAddress, MailMessage } from "../types.js";

export type NodemailerSmtpProviderOptions = {
  /** Injected transporter for tests; production uses SMTP_* env. */
  transporter?: Transporter;
  from?: string;
};

function resolveRecipients(to: MailAddress | MailAddress[]): string | string[] {
  if (Array.isArray(to)) {
    return to.map(formatMailAddress);
  }
  return formatMailAddress(to);
}

function createTransporterFromEnv(): Transporter {
  const host = env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST is required when EMAIL_PROVIDER=smtp");
  }

  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();

  return nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(user && pass
      ? {
          auth: {
            user,
            pass,
          },
        }
      : {}),
  });
}

/**
 * Sends mail via Nodemailer + SMTP (Batch E1).
 * Callers must use emailService — do not import this from feature services.
 */
export class NodemailerSmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;

  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: NodemailerSmtpProviderOptions = {}) {
    this.transporter = options.transporter ?? createTransporterFromEnv();
    this.from = options.from?.trim() || env.EMAIL_FROM;
  }

  async send(message: MailMessage): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: resolveRecipients(message.to),
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
      ...(message.replyTo !== undefined
        ? { replyTo: formatMailAddress(message.replyTo) }
        : {}),
      ...(message.headers !== undefined ? { headers: message.headers } : {}),
    });

    if (env.NODE_ENV !== "production") {
      const messageId =
        typeof info === "object" &&
        info !== null &&
        "messageId" in info &&
        typeof info.messageId === "string"
          ? info.messageId
          : "unknown";
      console.info(
        `[email:smtp] queued messageId=${messageId} to=${describeTo(message.to)}`,
      );
    }
  }
}

function describeTo(to: MailAddress | MailAddress[]): string {
  if (Array.isArray(to)) {
    return to.map(formatMailAddress).join(", ");
  }
  return formatMailAddress(to);
}
