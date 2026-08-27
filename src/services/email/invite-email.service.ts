import { env } from "../../config/env.js";

export type SendGroupInviteEmailInput = {
  to: string;
  groupName: string;
  invitedByName: string;
  inviteUrl: string;
};

/**
 * Dev/test stub — logs the invite link. Replace with a real provider later.
 */
export async function sendGroupInviteEmail(
  input: SendGroupInviteEmailInput,
): Promise<void> {
  if (env.NODE_ENV === "production") {
    // No email provider configured yet; still succeed so invite is stored.
    console.warn(
      `[invite] Email provider not configured. Invite for ${input.to}: ${input.inviteUrl}`,
    );
    return;
  }

  console.info(
    `[invite] To: ${input.to} | Group: ${input.groupName} | From: ${input.invitedByName} | URL: ${input.inviteUrl}`,
  );
}

export function buildGroupInviteUrl(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/app/invites/${token}`;
}
