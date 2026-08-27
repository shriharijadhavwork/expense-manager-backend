import mongoose from "mongoose";
import { Group, type GroupDocument } from "../models/group.model.js";

export type CreateGroupRecord = {
  name: string;
  createdBy: string;
};

export type UpdateGroupRecord = {
  name?: string;
  deletedAt?: Date | null;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const groupRepository = {
  async create(input: CreateGroupRecord): Promise<GroupDocument> {
    return Group.create({
      name: input.name,
      createdBy: toObjectId(input.createdBy),
    });
  },

  async findById(groupId: string): Promise<GroupDocument | null> {
    return Group.findOne({
      _id: toObjectId(groupId),
      deletedAt: null,
    }).exec();
  },

  async findByIds(groupIds: string[]): Promise<GroupDocument[]> {
    if (groupIds.length === 0) {
      return [];
    }

    return Group.find({
      _id: { $in: groupIds.map(toObjectId) },
      deletedAt: null,
    }).exec();
  },

  async updateById(
    groupId: string,
    updates: UpdateGroupRecord,
  ): Promise<GroupDocument | null> {
    return Group.findOneAndUpdate(
      {
        _id: toObjectId(groupId),
        deletedAt: null,
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async softDeleteById(groupId: string): Promise<GroupDocument | null> {
    return Group.findOneAndUpdate(
      {
        _id: toObjectId(groupId),
        deletedAt: null,
      },
      { $set: { deletedAt: new Date() } },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },
};
