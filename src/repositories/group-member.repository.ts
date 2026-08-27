import mongoose from "mongoose";
import type { UserRelation } from "../constants/relation.js";
import {
  GroupMember,
  type GroupMemberDocument,
  type GroupMemberRole,
} from "../models/group-member.model.js";

export type CreateGroupMemberRecord = {
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  addedBy: string | null;
  relation?: UserRelation | null;
  joinedAt?: Date;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const groupMemberRepository = {
  async create(input: CreateGroupMemberRecord): Promise<GroupMemberDocument> {
    return GroupMember.create({
      groupId: toObjectId(input.groupId),
      userId: toObjectId(input.userId),
      role: input.role,
      relation: input.relation ?? null,
      addedBy: input.addedBy ? toObjectId(input.addedBy) : null,
      joinedAt: input.joinedAt ?? new Date(),
      leftAt: null,
    });
  },

  async createMany(
    inputs: CreateGroupMemberRecord[],
  ): Promise<GroupMemberDocument[]> {
    if (inputs.length === 0) {
      return [];
    }

    return GroupMember.insertMany(
      inputs.map((input) => ({
        groupId: toObjectId(input.groupId),
        userId: toObjectId(input.userId),
        role: input.role,
        relation: input.relation ?? null,
        addedBy: input.addedBy ? toObjectId(input.addedBy) : null,
        joinedAt: input.joinedAt ?? new Date(),
        leftAt: null,
      })),
    );
  },

  async findActiveByGroupId(groupId: string): Promise<GroupMemberDocument[]> {
    return GroupMember.find({
      groupId: toObjectId(groupId),
      leftAt: null,
    })
      .sort({ joinedAt: 1 })
      .exec();
  },

  async findActiveByUserId(userId: string): Promise<GroupMemberDocument[]> {
    return GroupMember.find({
      userId: toObjectId(userId),
      leftAt: null,
    })
      .sort({ joinedAt: -1 })
      .exec();
  },

  async findActiveMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMemberDocument | null> {
    return GroupMember.findOne({
      groupId: toObjectId(groupId),
      userId: toObjectId(userId),
      leftAt: null,
    }).exec();
  },

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMemberDocument | null> {
    return GroupMember.findOne({
      groupId: toObjectId(groupId),
      userId: toObjectId(userId),
    })
      .sort({ joinedAt: -1 })
      .exec();
  },

  async markLeft(
    groupId: string,
    userId: string,
    leftAt = new Date(),
  ): Promise<GroupMemberDocument | null> {
    return GroupMember.findOneAndUpdate(
      {
        groupId: toObjectId(groupId),
        userId: toObjectId(userId),
        leftAt: null,
      },
      { $set: { leftAt } },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async reactivate(
    membershipId: string,
    input: {
      role: GroupMemberRole;
      addedBy: string | null;
      relation?: UserRelation | null;
      joinedAt?: Date;
    },
  ): Promise<GroupMemberDocument | null> {
    return GroupMember.findOneAndUpdate(
      { _id: toObjectId(membershipId) },
      {
        $set: {
          role: input.role,
          relation: input.relation ?? null,
          addedBy: input.addedBy ? toObjectId(input.addedBy) : null,
          joinedAt: input.joinedAt ?? new Date(),
          leftAt: null,
        },
      },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async updateRole(
    groupId: string,
    userId: string,
    role: GroupMemberRole,
  ): Promise<GroupMemberDocument | null> {
    return GroupMember.findOneAndUpdate(
      {
        groupId: toObjectId(groupId),
        userId: toObjectId(userId),
        leftAt: null,
      },
      { $set: { role } },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async countActiveOwners(groupId: string): Promise<number> {
    return GroupMember.countDocuments({
      groupId: toObjectId(groupId),
      role: "owner",
      leftAt: null,
    }).exec();
  },

  async countActiveMembers(groupId: string): Promise<number> {
    return GroupMember.countDocuments({
      groupId: toObjectId(groupId),
      leftAt: null,
    }).exec();
  },
};
