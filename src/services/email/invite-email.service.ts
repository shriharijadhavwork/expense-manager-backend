import { USER_RELATION_LABELS, type UserRelation } from "../../constants/relation.js";
import { env } from "../../config/env.js";
import { emailService } from "./email.service.js";
import { buildGroupInviteTemplate } from "./templates/group-invite.js";

export type SendGroupInviteEmailInput = {
  to: string;
  groupName: string;
  invitedByName: string;
  invitedByEmail: string;
  relation: UserRelation;
  inviteUrl: string;
};

/**
 * Builds the group-invite template and sends via the shared mailer.
 * Soft-fails on transport errors so invite records remain persisted (plan §3.1).
 */
export async function sendGroupInviteEmail(
  input: SendGroupInviteEmailInput,
): Promise<void> {
  const content = buildGroupInviteTemplate({
    groupName: input.groupName,
    invitedByName: input.invitedByName,
    invitedByEmail: input.invitedByEmail,
    relationLabel: USER_RELATION_LABELS[input.relation],
    inviteUrl: input.inviteUrl,
  });

  try {
    await emailService.send({
      to: input.to,
      subject: content.subject,
      text: content.text,
      ...(content.html !== undefined ? { html: content.html } : {}),
      headers: {
        "X-Entity-Ref": "group-invite",
      },
    });
  } catch (error) {
    console.error(
      `[invite] Failed to send invite email to=${input.to} url=${input.inviteUrl}`,
      error,
    );
  }
}

export function buildGroupInviteUrl(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/invites/${token}`;
}
