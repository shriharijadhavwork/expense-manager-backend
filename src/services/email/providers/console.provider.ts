import { describeRecipients } from "../normalize-mail-message.js";
import type { EmailProvider, MailMessage } from "../types.js";

/**
 * Local / test provider — logs mail instead of sending.
 * Used when EMAIL_PROVIDER=console (default until SMTP/SES are configured).
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(message: MailMessage): Promise<void> {
    const recipients = describeRecipients(message.to);
    const htmlNote = message.html
      ? ` htmlChars=${message.html.length}`
      : "";

    console.info(
      `[email:console] to=${recipients} subject=${JSON.stringify(message.subject)} textChars=${message.text.length}${htmlNote}`,
    );

    if (process.env["NODE_ENV"] !== "production") {
      console.info(`[email:console] text:\n${message.text}`);
    }
  }
}
