import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import { DEFAULT_CURRENCY } from "../constants/currency.js";

export interface IExpense {
  userId: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  category: string;
  note: string;
  date: Date;
  sourceThreadId?: mongoose.Types.ObjectId;
  sourceMessageId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpenseDocument = HydratedDocument<IExpense>;
export type ExpenseModel = Model<IExpense>;

const expenseSchema = new Schema<IExpense>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: DEFAULT_CURRENCY,
      minlength: 3,
      maxlength: 3,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    note: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    sourceThreadId: {
      type: Schema.Types.ObjectId,
      ref: "Thread",
      index: true,
    },
    sourceMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          userId: String(ret["userId"]),
          ...(ret["groupId"] ? { groupId: String(ret["groupId"]) } : {}),
          amount: ret["amount"],
          currency: ret["currency"],
          category: ret["category"],
          note: ret["note"],
          date: ret["date"],
          ...(ret["sourceThreadId"]
            ? { sourceThreadId: String(ret["sourceThreadId"]) }
            : {}),
          ...(ret["sourceMessageId"]
            ? { sourceMessageId: String(ret["sourceMessageId"]) }
            : {}),
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, category: 1 });

export const Expense: ExpenseModel = mongoose.model<IExpense>(
  "Expense",
  expenseSchema,
);
