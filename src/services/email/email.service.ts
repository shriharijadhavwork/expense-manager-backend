import { env } from "../../config/env.js";
import { formatMailAddress } from "./mail-address.js";
import { normalizeMailMessage } from "./normalize-mail-message.js";
import { createEmailProvider } from "./providers/create-email-provider.js";
import type { EmailProvider, MailMessage } from "./types.js";

let providerOverride: EmailProvider | null = null;
let defaultProvider: EmailProvider | null = null;

function resolveProvider(): EmailProvider {
  if (providerOverride) {
    return providerOverride;
  }

  if (!defaultProvider) {
    defaultProvider = createEmailProvider(env.EMAIL_PROVIDER);
  }

  return defaultProvider;
}

/**
 * Transport-agnostic mail facade.
 * Feature code must call this (or templates + this) — never a provider directly.
 */
export const emailService = {
  async send(message: MailMessage): Promise<void> {
    const normalized = normalizeMailMessage(message);
    const provider = resolveProvider();

    try {
      await provider.send(normalized);
    } catch (error) {
      const recipients = Array.isArray(normalized.to)
        ? normalized.to.map(formatMailAddress).join(", ")
        : formatMailAddress(normalized.to);

      console.error(
        `[email] Failed to send via ${provider.name} to=${recipients} subject=${JSON.stringify(normalized.subject)}`,
        error,
      );
      throw error;
    }
  },

  /**
   * Test helper — inject a mock provider. Pass `null` to clear the override.
   */
  setProvider(provider: EmailProvider | null): void {
    providerOverride = provider;
  },

  /** Drop cached default provider (e.g. after env change in tests). */
  resetDefaultProvider(): void {
    defaultProvider = null;
  },
};
