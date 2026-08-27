import { EMAIL_BRAND } from "../../../constants/brand.js";
import { escapeHtml } from "../mail-address.js";
import type { EmailTemplateContent } from "../types.js";
import {
  buildTransactionalEmail,
  htmlCta,
  htmlParagraph,
} from "./layout.js";

export type GroupInviteTemplateInput = {
  groupName: string;
  invitedByName: string;
  invitedByEmail: string;
  relationLabel: string;
  inviteUrl: string;
};

export function buildGroupInviteTemplate(
  input: GroupInviteTemplateInput,
): EmailTemplateContent {
  const groupName = input.groupName.trim() || "a group";
  const invitedByName = input.invitedByName.trim() || "Someone";
  const invitedByEmail = input.invitedByEmail.trim();
  const relationLabel = input.relationLabel.trim() || "Friend";
  const inviteUrl = input.inviteUrl.trim();

  if (!inviteUrl) {
    throw new Error("inviteUrl is required for group invite email");
  }

  const safeName = escapeHtml(invitedByName);
  const safeEmail = escapeHtml(invitedByEmail);
  const safeGroup = escapeHtml(groupName);
  const safeRelation = escapeHtml(relationLabel);
  const inviterLine = invitedByEmail
    ? `${invitedByName} (${invitedByEmail})`
    : invitedByName;
  const safeInviterLine = invitedByEmail
    ? `<strong>${safeName}</strong> (${safeEmail})`
    : `<strong>${safeName}</strong>`;

  return buildTransactionalEmail({
    subject: `${invitedByName} invited you to ${EMAIL_BRAND.appName}`,
    textParagraphs: [
      `${inviterLine} invited you to join “${groupName}” on ${EMAIL_BRAND.appName} as ${relationLabel}.`,
      "",
      "Open this link to accept the invite (sign in or sign up with this same email address):",
      inviteUrl,
    ],
    htmlBlocks: [
      htmlParagraph(
        `${safeInviterLine} invited you to join <strong>${safeGroup}</strong> on ${escapeHtml(EMAIL_BRAND.appName)} as <strong>${safeRelation}</strong>.`,
      ),
      htmlCta("Accept invite", inviteUrl),
    ],
    footerNote: "If you did not expect this invite, you can ignore this email.",
  });
}
