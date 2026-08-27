import mongoose from "mongoose";
import type { UserRelation } from "../constants/relation.js";
import {
  GroupInvite,
  type GroupInviteDocument,
  type GroupInviteStatus,
} from "../models/group-invite.model.js";

export type CreateGroupInviteRecord = {
  groupId: string;
  email: string;
  invitedBy: string;
  relation: UserRelation;
  token: string;
  expiresAt: Date;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const groupInviteRepository = {
  async create(input: CreateGroupInviteRecord): Promise<GroupInviteDocument> {
    return GroupInvite.create({
      groupId: toObjectId(input.groupId),
      email: input.email.toLowerCase(),
      invitedBy: toObjectId(input.invitedBy),
      relation: input.relation,
      token: input.token,
      status: "pending",
      expiresAt: input.expiresAt,
      acceptedAt: null,
      acceptedBy: null,
    });
  },

  async findById(inviteId: string): Promise<GroupInviteDocument | null> {
    return GroupInvite.findById(inviteId).exec();
  },

  async findByToken(token: string): Promise<GroupInviteDocument | null> {
    return GroupInvite.findOne({ token }).exec();
  },

  async findPendingByGroupAndEmail(
    groupId: string,
    email: string,
  ): Promise<GroupInviteDocument | null> {
    return GroupInvite.findOne({
      groupId: toObjectId(groupId),
      email: email.toLowerCase(),
      status: "pending",
    }).exec();
  },

  async listByGroupId(groupId: string): Promise<GroupInviteDocument[]> {
    return GroupInvite.find({
      groupId: toObjectId(groupId),
    })
      .sort({ createdAt: -1 })
      .exec();
  },

  async updateStatus(
    inviteId: string,
    updates: {
      status: GroupInviteStatus;
      acceptedAt?: Date | null;
      acceptedBy?: string | null;
      expiresAt?: Date;
      token?: string;
      relation?: UserRelation;
    },
  ): Promise<GroupInviteDocument | null> {
    const $set: Record<string, unknown> = {
      status: updates.status,
    };

    if (updates.acceptedAt !== undefined) {
      $set["acceptedAt"] = updates.acceptedAt;
    }
    if (updates.acceptedBy !== undefined) {
      $set["acceptedBy"] = updates.acceptedBy
        ? toObjectId(updates.acceptedBy)
        : null;
    }
    if (updates.expiresAt !== undefined) {
      $set["expiresAt"] = updates.expiresAt;
    }
    if (updates.token !== undefined) {
      $set["token"] = updates.token;
    }
    if (updates.relation !== undefined) {
      $set["relation"] = updates.relation;
    }

    return GroupInvite.findByIdAndUpdate(
      inviteId,
      { $set },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },
};
