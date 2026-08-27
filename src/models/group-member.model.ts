import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export const GROUP_MEMBER_ROLES = ["owner", "member"] as const;
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

export interface IGroupMember {
  groupId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: GroupMemberRole;
  addedBy: mongoose.Types.ObjectId | null;
  joinedAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GroupMemberDocument = HydratedDocument<IGroupMember>;
export type GroupMemberModel = Model<IGroupMember>;

const groupMemberSchema = new Schema<IGroupMember>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: GROUP_MEMBER_ROLES,
      required: true,
      default: "member",
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    joinedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          groupId: String(ret["groupId"]),
          userId: String(ret["userId"]),
          role: ret["role"],
          addedBy: ret["addedBy"] ? String(ret["addedBy"]) : null,
          joinedAt: ret["joinedAt"],
          leftAt: ret["leftAt"],
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

groupMemberSchema.index(
  { groupId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { leftAt: null },
  },
);

groupMemberSchema.index({ userId: 1, leftAt: 1 });

export const GroupMember: GroupMemberModel = mongoose.model<IGroupMember>(
  "GroupMember",
  groupMemberSchema,
);
