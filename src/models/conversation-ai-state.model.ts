import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export type ConversationExpenseDraft = {
  amount?: number;
  category?: string;
  note?: string;
  date?: string;
  currency?: string;
};

export interface IConversationAiState {
  threadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  currentIntent?: string;
  expenseDraft?: ConversationExpenseDraft;
  missingRequiredFields?: string[];
  lastProcessedMessageId?: mongoose.Types.ObjectId;
  lastProcessedAt?: Date;
  summary?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationAiStateDocument =
  HydratedDocument<IConversationAiState>;
export type ConversationAiStateModel = Model<IConversationAiState>;

const expenseDraftSchema = new Schema<ConversationExpenseDraft>(
  {
    amount: { type: Number, min: 0 },
    category: { type: String, trim: true },
    note: { type: String, trim: true },
    date: { type: String, trim: true },
    currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
  },
  { _id: false },
);

const conversationAiStateSchema = new Schema<IConversationAiState>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "Thread",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    currentIntent: {
      type: String,
      trim: true,
    },
    expenseDraft: {
      type: expenseDraftSchema,
      default: undefined,
    },
    missingRequiredFields: {
      type: [String],
      default: undefined,
    },
    lastProcessedMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastProcessedAt: {
      type: Date,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          threadId: String(ret["threadId"]),
          userId: String(ret["userId"]),
          currentIntent: ret["currentIntent"],
          expenseDraft: ret["expenseDraft"],
          missingRequiredFields: ret["missingRequiredFields"],
          lastProcessedMessageId: ret["lastProcessedMessageId"]
            ? String(ret["lastProcessedMessageId"])
            : undefined,
          lastProcessedAt: ret["lastProcessedAt"],
          summary: ret["summary"],
          version: ret["version"],
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

export const ConversationAiState: ConversationAiStateModel =
  mongoose.model<IConversationAiState>(
    "ConversationAiState",
    conversationAiStateSchema,
  );
