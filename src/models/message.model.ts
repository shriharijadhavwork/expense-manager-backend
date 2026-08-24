import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface IMessage {
  threadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MessageRole;
  content: string;
  attachmentIds: mongoose.Types.ObjectId[];
  expenseIds: mongoose.Types.ObjectId[];
  createdAt: Date;
}

export type MessageDocument = HydratedDocument<IMessage>;
export type MessageModel = Model<IMessage>;

const messageSchema = new Schema<IMessage>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "Thread",
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
      enum: MESSAGE_ROLES,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    attachmentIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    expenseIds: {
      type: [Schema.Types.ObjectId],
      ref: "Expense",
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          threadId: String(ret["threadId"]),
          userId: String(ret["userId"]),
          role: ret["role"],
          content: ret["content"],
          attachmentIds: (ret["attachmentIds"] as mongoose.Types.ObjectId[]).map(
            (id) => String(id),
          ),
          expenseIds: (ret["expenseIds"] as mongoose.Types.ObjectId[]).map(
            (id) => String(id),
          ),
          createdAt: ret["createdAt"],
        };
      },
    },
  },
);

messageSchema.index({ threadId: 1, createdAt: -1, _id: -1 });

export const Message: MessageModel = mongoose.model<IMessage>(
  "Message",
  messageSchema,
);
