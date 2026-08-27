import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export const THREAD_TYPES = ["personal", "group"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

export const THREAD_STATUSES = ["active", "archived"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export interface IThread {
  type: ThreadType;
  userId: mongoose.Types.ObjectId | null;
  groupId: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  dayKey: string;
  sequence: number;
  title: string;
  status: ThreadStatus;
  deletedAt: Date | null;
  lastActivityAt: Date;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ThreadDocument = HydratedDocument<IThread>;
export type ThreadModel = Model<IThread>;

const threadSchema = new Schema<IThread>(
  {
    type: {
      type: String,
      enum: THREAD_TYPES,
      required: true,
      default: "personal",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: THREAD_STATUSES,
      required: true,
      default: "active",
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastActivityAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    readAt: {
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
          type: ret["type"],
          userId: ret["userId"] ? String(ret["userId"]) : null,
          groupId: ret["groupId"] ? String(ret["groupId"]) : null,
          createdBy: String(ret["createdBy"]),
          dayKey: ret["dayKey"],
          sequence: ret["sequence"],
          title: ret["title"],
          lastActivityAt: ret["lastActivityAt"],
          readAt: ret["readAt"] ?? null,
          deletedAt: ret["deletedAt"] ?? null,
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

threadSchema.pre("validate", function () {
  const hasUser = this.userId != null;
  const hasGroup = this.groupId != null;

  if (this.type === "personal") {
    if (!hasUser || hasGroup) {
      throw new Error(
        "Personal thread requires userId and must not have groupId",
      );
    }
  } else if (this.type === "group") {
    if (!hasGroup || hasUser) {
      throw new Error("Group thread requires groupId and must not have userId");
    }
  }
});

threadSchema.index({ userId: 1, deletedAt: 1, lastActivityAt: -1 });
threadSchema.index({ groupId: 1, deletedAt: 1, lastActivityAt: -1 });
threadSchema.index(
  { type: 1, userId: 1, dayKey: 1, sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "personal", userId: { $type: "objectId" } },
  },
);
threadSchema.index(
  { type: 1, groupId: 1, dayKey: 1, sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "group", groupId: { $type: "objectId" } },
  },
);

export const Thread: ThreadModel = mongoose.model<IThread>(
  "Thread",
  threadSchema,
);
