import type { EmailProvider, MailMessage } from "../types.js";

/**
 * Placeholder until Batch F1. Selecting EMAIL_PROVIDER=ses fails fast.
 */
export class SesEmailProvider implements EmailProvider {
  readonly name = "ses" as const;

  constructor() {
    throw new Error(
      "EMAIL_PROVIDER=ses is not implemented yet. Use console (or smtp after E1) until Batch F1.",
    );
  }

  async send(_message: MailMessage): Promise<void> {
    throw new Error("EMAIL_PROVIDER=ses is not implemented yet");
  }
}
