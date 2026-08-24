import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export interface IExpense {
  userId: mongoose.Types.ObjectId;
  amount: number;
  category: string;
  note: string;
  date: Date;
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
    amount: {
      type: Number,
      required: true,
      min: 0,
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
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          userId: String(ret["userId"]),
          amount: ret["amount"],
          category: ret["category"],
          note: ret["note"],
          date: ret["date"],
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
