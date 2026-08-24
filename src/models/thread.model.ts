import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export const THREAD_STATUSES = ["active", "archived"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export interface IThread {
  userId: mongoose.Types.ObjectId;
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
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      default: "New conversation",
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
          userId: String(ret["userId"]),
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

threadSchema.index({ userId: 1, deletedAt: 1, lastActivityAt: -1 });

export const Thread: ThreadModel = mongoose.model<IThread>(
  "Thread",
  threadSchema,
);
