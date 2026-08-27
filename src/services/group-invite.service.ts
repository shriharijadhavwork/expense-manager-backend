import { randomBytes } from "node:crypto";
import {
  USER_RELATION_LABELS,
  type UserRelation,
} from "../constants/relation.js";
import { groupInviteRepository } from "../repositories/group-invite.repository.js";
import { groupMemberRepository } from "../repositories/group-member.repository.js";
import { groupRepository } from "../repositories/group.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import type {
  CreateDirectInviteInput,
  CreateGroupInviteInput,
} from "../schemas/group-invite.schema.js";
import type { GroupInviteDocument } from "../models/group-invite.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  buildGroupInviteUrl,
  sendGroupInviteEmail,
} from "./email/invite-email.service.js";
import { postGroupSystemEvent } from "./group-system-message.service.js";
import { groupService, type SafeGroup } from "./group.service.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SafeGroupInvite = {
  id: string;
  groupId: string;
  email: string;
  invitedBy: string;
  relation: UserRelation;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  inviteUrl: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function createToken(): string {
  return randomBytes(32).toString("hex");
}

function toSafeInvite(
  invite: GroupInviteDocument,
  options?: { includeUrl?: boolean },
): SafeGroupInvite {
  const includeUrl = options?.includeUrl ?? invite.status === "pending";

  return {
    id: String(invite._id),
    groupId: String(invite.groupId),
    email: invite.email,
    invitedBy: String(invite.invitedBy),
    relation: invite.relation,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    inviteUrl: includeUrl ? buildGroupInviteUrl(invite.token) : null,
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
    acceptedBy: invite.acceptedBy ? String(invite.acceptedBy) : null,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
  };
}

async function markExpiredIfNeeded(
  invite: GroupInviteDocument,
): Promise<GroupInviteDocument> {
  if (
    invite.status === "pending" &&
    invite.expiresAt.getTime() <= Date.now()
  ) {
    const updated = await groupInviteRepository.updateStatus(String(invite._id), {
      status: "expired",
    });
    return updated ?? invite;
  }

  return invite;
}

async function requireOwnerMembership(
  userId: string,
  groupId: string,
): Promise<void> {
  const membership = await groupMemberRepository.findActiveMembership(
    groupId,
    userId,
  );

  if (!membership) {
    throw ApiError.notFound("Group not found");
  }

  if (membership.role !== "owner") {
    throw ApiError.forbidden("Only the group owner can manage invites");
  }

  const group = await groupRepository.findById(groupId);
  if (!group) {
    throw ApiError.notFound("Group not found");
  }
}

function directInviteGroupName(actorName: string, email: string): string {
  const local = email.split("@")[0]?.trim() || "Guest";
  const joined = `${actorName.trim() || "You"} & ${local}`;
  return joined.slice(0, 120);
}

export type InvitePreview = {
  email: string;
  groupName: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  relation: UserRelation;
  relationLabel: string;
  invitedByName: string;
  invitedByEmail: string;
};

export const groupInviteService = {
  async create(
    actorUserId: string,
    groupId: string,
    input: CreateGroupInviteInput,
  ): Promise<SafeGroupInvite> {
    await requireOwnerMembership(actorUserId, groupId);

    const email = input.email.toLowerCase();
    const relation = input.relation;
    const actor = await userRepository.findById(actorUserId);
    if (!actor) {
      throw ApiError.unauthorized("User not found");
    }

    if (actor.email.toLowerCase() === email) {
      throw ApiError.badRequest("You cannot invite yourself");
    }

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      const active = await groupMemberRepository.findActiveMembership(
        groupId,
        String(existingUser._id),
      );
      if (active) {
        throw ApiError.conflict("User is already a member of this group");
      }
    }

    const pending = await groupInviteRepository.findPendingByGroupAndEmail(
      groupId,
      email,
    );

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const token = createToken();

    let invite: GroupInviteDocument;

    if (pending) {
      const refreshed = await groupInviteRepository.updateStatus(
        String(pending._id),
        {
          status: "pending",
          token,
          expiresAt,
          relation,
          acceptedAt: null,
          acceptedBy: null,
        },
      );
      if (!refreshed) {
        throw ApiError.internal("Failed to refresh invite");
      }
      invite = refreshed;
    } else {
      invite = await groupInviteRepository.create({
        groupId,
        email,
        invitedBy: actorUserId,
        relation,
        token,
        expiresAt,
      });
    }

    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw ApiError.notFound("Group not found");
    }

    const inviteUrl = buildGroupInviteUrl(invite.token);
    await sendGroupInviteEmail({
      to: email,
      groupName: group.name,
      invitedByName: actor.name,
      invitedByEmail: actor.email,
      relation,
      inviteUrl,
    });

    return toSafeInvite(invite, { includeUrl: true });
  },

  async createDirect(
    actorUserId: string,
    input: CreateDirectInviteInput,
  ): Promise<SafeGroupInvite> {
    const actor = await userRepository.findById(actorUserId);
    if (!actor) {
      throw ApiError.unauthorized("User not found");
    }

    const email = input.email.toLowerCase();
    if (actor.email.toLowerCase() === email) {
      throw ApiError.badRequest("You cannot invite yourself");
    }

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw ApiError.badRequest(
        "An account already exists for that email. Use Start chat instead.",
      );
    }

    const group = await groupService.create(actorUserId, {
      name: directInviteGroupName(actor.name, email),
      memberIds: [],
      emails: [],
    });

    return groupInviteService.create(actorUserId, group.id, input);
  },

  async listForGroup(
    actorUserId: string,
    groupId: string,
  ): Promise<SafeGroupInvite[]> {
    await requireOwnerMembership(actorUserId, groupId);

    const invites = await groupInviteRepository.listByGroupId(groupId);
    const normalized: SafeGroupInvite[] = [];

    for (const invite of invites) {
      const current = await markExpiredIfNeeded(invite);
      normalized.push(
        toSafeInvite(current, {
          includeUrl: current.status === "pending",
        }),
      );
    }

    return normalized;
  },

  async revoke(
    actorUserId: string,
    groupId: string,
    inviteId: string,
  ): Promise<SafeGroupInvite> {
    await requireOwnerMembership(actorUserId, groupId);

    const invite = await groupInviteRepository.findById(inviteId);
    if (!invite || String(invite.groupId) !== groupId) {
      throw ApiError.notFound("Invite not found");
    }

    if (invite.status !== "pending") {
      throw ApiError.badRequest("Only pending invites can be revoked");
    }

    const updated = await groupInviteRepository.updateStatus(inviteId, {
      status: "revoked",
    });

    if (!updated) {
      throw ApiError.notFound("Invite not found");
    }

    return toSafeInvite(updated, { includeUrl: false });
  },

  async getPreview(token: string): Promise<InvitePreview> {
    const invite = await groupInviteRepository.findByToken(token);
    if (!invite) {
      throw ApiError.notFound("Invite not found");
    }

    const current = await markExpiredIfNeeded(invite);
    const group = await groupRepository.findById(String(current.groupId));
    const inviter = await userRepository.findById(String(current.invitedBy));

    return {
      email: current.email,
      groupName: group?.name ?? "Group",
      status: current.status,
      expiresAt: current.expiresAt.toISOString(),
      relation: current.relation,
      relationLabel: USER_RELATION_LABELS[current.relation],
      invitedByName: inviter?.name ?? "Someone",
      invitedByEmail: inviter?.email ?? "",
    };
  },

  async accept(actorUserId: string, token: string): Promise<SafeGroup> {
    const actor = await userRepository.findById(actorUserId);
    if (!actor) {
      throw ApiError.unauthorized("User not found");
    }

    const invite = await groupInviteRepository.findByToken(token);
    if (!invite) {
      throw ApiError.notFound("Invite not found");
    }

    const current = await markExpiredIfNeeded(invite);

    if (current.status === "expired") {
      throw ApiError.badRequest("Invite has expired");
    }

    if (current.status === "revoked") {
      throw ApiError.badRequest("Invite has been revoked");
    }

    if (current.status === "accepted") {
      throw ApiError.badRequest("Invite has already been accepted");
    }

    if (actor.email.toLowerCase() !== current.email.toLowerCase()) {
      throw ApiError.forbidden(
        "This invite was sent to a different email address",
      );
    }

    const groupId = String(current.groupId);
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw ApiError.notFound("Group not found");
    }

    const existing = await groupMemberRepository.findMembership(
      groupId,
      actorUserId,
    );

    if (existing && existing.leftAt === null) {
      await groupInviteRepository.updateStatus(String(current._id), {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: actorUserId,
      });
      return groupService.getById(actorUserId, groupId);
    }

    if (existing && existing.leftAt !== null) {
      await groupMemberRepository.reactivate(String(existing._id), {
        role: "member",
        addedBy: String(current.invitedBy),
        relation: current.relation,
      });
    } else {
      await groupMemberRepository.create({
        groupId,
        userId: actorUserId,
        role: "member",
        addedBy: String(current.invitedBy),
        relation: current.relation,
      });
    }

    await groupInviteRepository.updateStatus(String(current._id), {
      status: "accepted",
      acceptedAt: new Date(),
      acceptedBy: actorUserId,
    });

    const inviter = await userRepository.findById(String(current.invitedBy));
    void postGroupSystemEvent({
      groupId,
      actorUserId: String(current.invitedBy),
      event: {
        type: "member_added",
        actorName: inviter?.name ?? "Someone",
        targetName: actor.name,
      },
    });

    return groupService.getById(actorUserId, groupId);
  },
};
