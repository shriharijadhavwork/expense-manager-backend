import { groupRepository } from "../repositories/group.repository.js";
import { groupMemberRepository } from "../repositories/group-member.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import type { UserRelation } from "../constants/relation.js";
import type {
  AddGroupMemberInput,
  CreateGroupInput,
  CreateGroupThreadInput,
  ResolveGroupInput,
  TransferGroupOwnershipInput,
  UpdateGroupInput,
} from "../schemas/group.schema.js";
import type { GroupDocument } from "../models/group.model.js";
import type { GroupMemberDocument } from "../models/group-member.model.js";
import { ApiError } from "../utils/api-error.js";
import { postGroupSystemEvent } from "./group-system-message.service.js";
import { threadService, type SafeThread } from "./thread.service.js";

export type SafeGroupMember = {
  id: string;
  groupId: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  relation: UserRelation | null;
  addedBy: string | null;
  joinedAt: string;
};

export type SafeGroup = {
  id: string;
  name: string;
  createdBy: string;
  members: SafeGroupMember[];
  createdAt: string;
  updatedAt: string;
};

export type ResolveGroupResult = {
  group: SafeGroup;
  thread: SafeThread;
  created: boolean;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.toLowerCase().trim()))];
}

async function resolvePeerUserIds(input: {
  actorUserId: string;
  emails?: string[];
  memberIds?: string[];
}): Promise<string[]> {
  const actorId = input.actorUserId.toLowerCase();
  const peerIds = uniqueIds(input.memberIds ?? []).filter(
    (id) => id !== actorId,
  );
  const emails = uniqueEmails(input.emails ?? []);

  if (peerIds.length > 0) {
    const usersById = await userRepository.findByIds(peerIds);
    if (usersById.length !== peerIds.length) {
      throw ApiError.badRequest("One or more memberIds are invalid");
    }
  }

  if (emails.length > 0) {
    const usersByEmail = await userRepository.findByEmails(emails);
    const foundByEmail = new Map(
      usersByEmail.map(
        (user) => [user.email.toLowerCase(), String(user._id)] as const,
      ),
    );

    const missing = emails.filter((email) => !foundByEmail.has(email));
    if (missing.length > 0) {
      throw ApiError.badRequest(
        missing.length === 1
          ? `No account found for ${missing[0]}. Ask them to sign up, or invite them from a group's Members panel.`
          : `No account found for: ${missing.join(", ")}. Ask them to sign up, or invite them from a group's Members panel.`,
      );
    }

    for (const email of emails) {
      const userId = foundByEmail.get(email)!;
      if (userId.toLowerCase() === actorId) {
        continue;
      }
      if (!peerIds.some((id) => id.toLowerCase() === userId.toLowerCase())) {
        peerIds.push(userId);
      }
    }
  }

  return peerIds;
}

async function toSafeGroup(
  group: GroupDocument,
  members: GroupMemberDocument[],
): Promise<SafeGroup> {
  const users = await userRepository.findByIds(
    members.map((member) => String(member.userId)),
  );
  const userById = new Map(
    users.map((user) => [String(user._id).toLowerCase(), user] as const),
  );

  return {
    id: String(group._id),
    name: group.name,
    createdBy: String(group.createdBy),
    members: members.map((member) => {
      const user = userById.get(String(member.userId).toLowerCase());
      return {
        id: String(member._id),
        groupId: String(member.groupId),
        userId: String(member.userId),
        name: user?.name ?? "Unknown",
        email: user?.email ?? "",
        role: member.role,
        relation: member.relation ?? null,
        addedBy: member.addedBy ? String(member.addedBy) : null,
        joinedAt: member.joinedAt.toISOString(),
      };
    }),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

function sameMemberSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].map((id) => id.toLowerCase()).sort();
  const sortedRight = [...right].map((id) => id.toLowerCase()).sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

async function buildDefaultGroupName(memberIds: string[]): Promise<string> {
  const users = await userRepository.findByIds(memberIds);
  const nameById = new Map(
    users.map((user) => [String(user._id).toLowerCase(), user.name] as const),
  );
  const names = memberIds.map(
    (id) => nameById.get(id.toLowerCase()) ?? "Member",
  );
  const joined = names.join(" & ");
  return joined.slice(0, 120) || "Group";
}

async function findGroupByExactMemberSet(
  memberIds: string[],
): Promise<GroupDocument | null> {
  if (memberIds.length === 0) {
    return null;
  }

  const seedUserId = memberIds[0]!;
  const memberships =
    await groupMemberRepository.findActiveByUserId(seedUserId);

  for (const membership of memberships) {
    const groupId = String(membership.groupId);
    const activeMembers =
      await groupMemberRepository.findActiveByGroupId(groupId);
    const activeIds = activeMembers.map((member) => String(member.userId));

    if (sameMemberSet(activeIds, memberIds)) {
      const group = await groupRepository.findById(groupId);
      if (group) {
        return group;
      }
    }
  }

  return null;
}

export const groupService = {
  async create(userId: string, input: CreateGroupInput): Promise<SafeGroup> {
    const peerIds = await resolvePeerUserIds({
      actorUserId: userId,
      emails: input.emails,
      memberIds: input.memberIds,
    });

    const group = await groupRepository.create({
      name: input.name,
      createdBy: userId,
    });

    const groupId = String(group._id);
    const now = new Date();

    await groupMemberRepository.createMany([
      {
        groupId,
        userId,
        role: "owner",
        addedBy: null,
        joinedAt: now,
      },
      ...peerIds.map((memberId) => ({
        groupId,
        userId: memberId,
        role: "member" as const,
        addedBy: userId,
        joinedAt: now,
      })),
    ]);

    const members = await groupMemberRepository.findActiveByGroupId(groupId);
    return await toSafeGroup(group, members);
  },

  async resolve(
    actorUserId: string,
    input: ResolveGroupInput,
  ): Promise<ResolveGroupResult> {
    const peerIds = await resolvePeerUserIds({
      actorUserId,
      emails: input.emails,
      memberIds: input.memberIds,
    });

    if (peerIds.length === 0) {
      throw ApiError.badRequest("At least one other member is required");
    }

    const desiredMemberIds = [actorUserId, ...peerIds];
    const existing = await findGroupByExactMemberSet(desiredMemberIds);

    let group: SafeGroup;
    let created = false;

    if (existing) {
      group = await loadSafeGroup(String(existing._id));
    } else {
      const name =
        input.name?.trim() || (await buildDefaultGroupName(desiredMemberIds));
      group = await groupService.create(actorUserId, {
        name,
        memberIds: peerIds,
        emails: [],
      });
      created = true;
    }

    const thread = await threadService.createForGroup(actorUserId, group.id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
    });

    return { group, thread, created };
  },

  async createThread(
    actorUserId: string,
    groupId: string,
    input: CreateGroupThreadInput = {},
  ): Promise<SafeThread> {
    await requireActiveMembership(actorUserId, groupId);
    return threadService.createForGroup(actorUserId, groupId, input);
  },

  async listThreads(
    actorUserId: string,
    groupId: string,
  ): Promise<SafeThread[]> {
    await requireActiveMembership(actorUserId, groupId);
    return threadService.listForGroup(actorUserId, groupId);
  },

  async list(userId: string): Promise<SafeGroup[]> {
    const memberships = await groupMemberRepository.findActiveByUserId(userId);
    const groupIds = memberships.map((membership) => String(membership.groupId));
    const groups = await groupRepository.findByIds(groupIds);
    const groupById = new Map(
      groups.map((group) => [String(group._id), group] as const),
    );

    const results: SafeGroup[] = [];

    for (const membership of memberships) {
      const group = groupById.get(String(membership.groupId));
      if (!group) {
        continue;
      }

      const members = await groupMemberRepository.findActiveByGroupId(
        String(group._id),
      );
      results.push(await toSafeGroup(group, members));
    }

    return results;
  },

  async getById(userId: string, groupId: string): Promise<SafeGroup> {
    const membership = await groupMemberRepository.findActiveMembership(
      groupId,
      userId,
    );

    if (!membership) {
      throw ApiError.notFound("Group not found");
    }

    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw ApiError.notFound("Group not found");
    }

    const members = await groupMemberRepository.findActiveByGroupId(groupId);
    return await toSafeGroup(group, members);
  },

  async update(
    userId: string,
    groupId: string,
    input: UpdateGroupInput,
  ): Promise<SafeGroup> {
    const membership = await groupMemberRepository.findActiveMembership(
      groupId,
      userId,
    );

    if (!membership) {
      throw ApiError.notFound("Group not found");
    }

    if (membership.role !== "owner") {
      throw ApiError.forbidden("Only the group owner can rename the group");
    }

    const updates: { name?: string } = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }

    const group = await groupRepository.updateById(groupId, updates);
    if (!group) {
      throw ApiError.notFound("Group not found");
    }

    const members = await groupMemberRepository.findActiveByGroupId(groupId);
    return await toSafeGroup(group, members);
  },

  async addMember(
    actorUserId: string,
    groupId: string,
    input: AddGroupMemberInput,
  ): Promise<SafeGroup> {
    const actorMembership = await requireActiveMembership(actorUserId, groupId);
    requireOwner(actorMembership);

    let targetUser =
      input.email !== undefined
        ? await userRepository.findByEmail(input.email)
        : await userRepository.findById(input.userId!);

    if (!targetUser && input.email) {
      throw ApiError.badRequest(
        `No account found for ${input.email}. Send an invite from the Members panel instead.`,
      );
    }

    if (!targetUser) {
      throw ApiError.badRequest("userId is invalid");
    }

    const targetUserId = String(targetUser._id);

    if (targetUserId.toLowerCase() === actorUserId.toLowerCase()) {
      throw ApiError.badRequest("You are already in this group");
    }

    const existing = await groupMemberRepository.findMembership(
      groupId,
      targetUserId,
    );

    if (existing && existing.leftAt === null) {
      throw ApiError.conflict("User is already a member of this group");
    }

    if (existing && existing.leftAt !== null) {
      await groupMemberRepository.reactivate(String(existing._id), {
        role: "member",
        addedBy: actorUserId,
      });
    } else {
      await groupMemberRepository.create({
        groupId,
        userId: targetUserId,
        role: "member",
        addedBy: actorUserId,
      });
    }

    const actor = await userRepository.findById(actorUserId);
    void postGroupSystemEvent({
      groupId,
      actorUserId,
      event: {
        type: "member_added",
        actorName: actor?.name ?? "Someone",
        targetName: targetUser.name,
      },
    });

    return loadSafeGroup(groupId);
  },

  async removeMember(
    actorUserId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<SafeGroup> {
    const actorMembership = await requireActiveMembership(actorUserId, groupId);
    requireOwner(actorMembership);

    if (targetUserId.toLowerCase() === actorUserId.toLowerCase()) {
      throw ApiError.badRequest("Use leave to remove yourself from the group");
    }

    const targetMembership = await groupMemberRepository.findActiveMembership(
      groupId,
      targetUserId,
    );

    if (!targetMembership) {
      throw ApiError.notFound("Member not found");
    }

    if (targetMembership.role === "owner") {
      const ownerCount = await groupMemberRepository.countActiveOwners(groupId);
      if (ownerCount <= 1) {
        throw ApiError.badRequest(
          "Cannot remove the only owner. Transfer ownership first.",
        );
      }
    }

    const [actor, targetUser] = await Promise.all([
      userRepository.findById(actorUserId),
      userRepository.findById(targetUserId),
    ]);

    await groupMemberRepository.markLeft(groupId, targetUserId);

    void postGroupSystemEvent({
      groupId,
      actorUserId,
      event: {
        type: "member_removed",
        actorName: actor?.name ?? "Someone",
        targetName: targetUser?.name ?? "a member",
      },
    });

    return loadSafeGroup(groupId);
  },

  async leave(
    userId: string,
    groupId: string,
  ): Promise<{ message: string; dissolved: boolean }> {
    const membership = await requireActiveMembership(userId, groupId);
    const actor = await userRepository.findById(userId);

    if (membership.role === "owner") {
      const memberCount =
        await groupMemberRepository.countActiveMembers(groupId);

      if (memberCount > 1) {
        throw ApiError.badRequest(
          "Transfer ownership before leaving, or remove other members first",
        );
      }

      await groupMemberRepository.markLeft(groupId, userId);
      await groupRepository.softDeleteById(groupId);

      return {
        message: "Left group and dissolved it (you were the last member)",
        dissolved: true,
      };
    }

    await groupMemberRepository.markLeft(groupId, userId);

    void postGroupSystemEvent({
      groupId,
      actorUserId: userId,
      event: {
        type: "member_left",
        actorName: actor?.name ?? "Someone",
      },
    });

    return {
      message: "Left the group",
      dissolved: false,
    };
  },

  async transferOwnership(
    actorUserId: string,
    groupId: string,
    input: TransferGroupOwnershipInput,
  ): Promise<SafeGroup> {
    const actorMembership = await requireActiveMembership(actorUserId, groupId);
    requireOwner(actorMembership);

    const targetUserId = input.userId;
    if (targetUserId.toLowerCase() === actorUserId.toLowerCase()) {
      throw ApiError.badRequest("You already own this group");
    }

    const targetMembership = await groupMemberRepository.findActiveMembership(
      groupId,
      targetUserId,
    );

    if (!targetMembership) {
      throw ApiError.badRequest("New owner must be an active group member");
    }

    const [actor, targetUser] = await Promise.all([
      userRepository.findById(actorUserId),
      userRepository.findById(targetUserId),
    ]);

    await groupMemberRepository.updateRole(groupId, targetUserId, "owner");
    await groupMemberRepository.updateRole(groupId, actorUserId, "member");

    void postGroupSystemEvent({
      groupId,
      actorUserId,
      event: {
        type: "ownership_transferred",
        actorName: actor?.name ?? "Someone",
        targetName: targetUser?.name ?? "a member",
      },
    });

    return loadSafeGroup(groupId);
  },
};

async function requireActiveMembership(
  userId: string,
  groupId: string,
): Promise<GroupMemberDocument> {
  const membership = await groupMemberRepository.findActiveMembership(
    groupId,
    userId,
  );

  if (!membership) {
    throw ApiError.notFound("Group not found");
  }

  const group = await groupRepository.findById(groupId);
  if (!group) {
    throw ApiError.notFound("Group not found");
  }

  return membership;
}

function requireOwner(membership: GroupMemberDocument): void {
  if (membership.role !== "owner") {
    throw ApiError.forbidden("Only the group owner can perform this action");
  }
}

async function loadSafeGroup(groupId: string): Promise<SafeGroup> {
  const group = await groupRepository.findById(groupId);
  if (!group) {
    throw ApiError.notFound("Group not found");
  }

  const members = await groupMemberRepository.findActiveByGroupId(groupId);
  return await toSafeGroup(group, members);
}
