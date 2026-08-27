import { env } from "../../../config/env.js";
import type { EmailProvider, EmailProviderName } from "../types.js";
import { ConsoleEmailProvider } from "./console.provider.js";
import { NodemailerSmtpEmailProvider } from "./nodemailer-smtp.provider.js";
import { SesEmailProvider } from "./ses.provider.js";

export function createEmailProvider(
  name: EmailProviderName = env.EMAIL_PROVIDER,
): EmailProvider {
  switch (name) {
    case "console":
      // Production + console is rejected at env boot (Batch E5).
      return new ConsoleEmailProvider();
    case "smtp":
      return new NodemailerSmtpEmailProvider();
    case "ses":
      return new SesEmailProvider();
    default: {
      const exhaustive: never = name;
      throw new Error(`Unsupported EMAIL_PROVIDER: ${String(exhaustive)}`);
    }
  }
}
