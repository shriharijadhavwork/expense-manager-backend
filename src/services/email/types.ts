export type MailAddress =
  | string
  | {
      address: string;
      name?: string;
    };

export type MailMessage = {
  to: MailAddress | MailAddress[];
  subject: string;
  /** Plain-text body (required for accessibility and clients that block HTML). */
  text: string;
  html?: string;
  replyTo?: MailAddress;
  headers?: Record<string, string>;
};

export type EmailProviderName = "console" | "smtp" | "ses";

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: MailMessage): Promise<void>;
}

export type EmailTemplateContent = {
  subject: string;
  text: string;
  html?: string;
};
