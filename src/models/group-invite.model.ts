import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import {
  USER_RELATIONS,
  type UserRelation,
} from "../constants/relation.js";

export const GROUP_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type GroupInviteStatus = (typeof GROUP_INVITE_STATUSES)[number];

export interface IGroupInvite {
  groupId: mongoose.Types.ObjectId;
  email: string;
  invitedBy: mongoose.Types.ObjectId;
  relation: UserRelation;
  token: string;
  status: GroupInviteStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GroupInviteDocument = HydratedDocument<IGroupInvite>;
export type GroupInviteModel = Model<IGroupInvite>;

const groupInviteSchema = new Schema<IGroupInvite>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    relation: {
      type: String,
      enum: USER_RELATIONS,
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: GROUP_INVITE_STATUSES,
      required: true,
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
          email: ret["email"],
          invitedBy: String(ret["invitedBy"]),
          relation: ret["relation"],
          status: ret["status"],
          expiresAt: ret["expiresAt"],
          acceptedAt: ret["acceptedAt"],
          acceptedBy: ret["acceptedBy"] ? String(ret["acceptedBy"]) : null,
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

groupInviteSchema.index(
  { groupId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
);

export const GroupInvite: GroupInviteModel = mongoose.model<IGroupInvite>(
  "GroupInvite",
  groupInviteSchema,
);
