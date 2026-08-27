import mongoose from "mongoose";
import { Expense, type ExpenseDocument } from "../models/expense.model.js";

export type CreateExpenseRecord = {
  userId: string;
  groupId?: string;
  amount: number;
  currency: string;
  category: string;
  note: string;
  date: Date;
  sourceThreadId?: string;
  sourceMessageId?: string;
};

export type UpdateExpenseRecord = {
  amount?: number;
  currency?: string;
  category?: string;
  note?: string;
  date?: Date;
};

export type ExpenseSearchFilter = {
  userId: string;
  category?: string;
  from?: Date;
  to?: Date;
};

type ExpenseQuery = {
  userId: mongoose.Types.ObjectId;
  category?: string;
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const expenseRepository = {
  async create(input: CreateExpenseRecord): Promise<ExpenseDocument> {
    return Expense.create({
      userId: toObjectId(input.userId),
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      note: input.note,
      date: input.date,
      ...(input.groupId ? { groupId: toObjectId(input.groupId) } : {}),
      ...(input.sourceThreadId
        ? { sourceThreadId: toObjectId(input.sourceThreadId) }
        : {}),
      ...(input.sourceMessageId
        ? { sourceMessageId: toObjectId(input.sourceMessageId) }
        : {}),
    });
  },

  async findAllByUserId(userId: string): Promise<ExpenseDocument[]> {
    return Expense.find({ userId: toObjectId(userId) })
      .sort({ date: -1, createdAt: -1 })
      .exec();
  },

  async findByIdForUser(
    expenseId: string,
    userId: string,
  ): Promise<ExpenseDocument | null> {
    return Expense.findOne({
      _id: toObjectId(expenseId),
      userId: toObjectId(userId),
    }).exec();
  },

  async updateByIdForUser(
    expenseId: string,
    userId: string,
    updates: UpdateExpenseRecord,
  ): Promise<ExpenseDocument | null> {
    return Expense.findOneAndUpdate(
      {
        _id: toObjectId(expenseId),
        userId: toObjectId(userId),
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },

  async deleteByIdForUser(
    expenseId: string,
    userId: string,
  ): Promise<ExpenseDocument | null> {
    return Expense.findOneAndDelete({
      _id: toObjectId(expenseId),
      userId: toObjectId(userId),
    }).exec();
  },

  async searchForUser(filter: ExpenseSearchFilter): Promise<ExpenseDocument[]> {
    const query: ExpenseQuery = {
      userId: toObjectId(filter.userId),
    };

    if (filter.category) {
      query.category = filter.category;
    }

    if (filter.from || filter.to) {
      query.date = {};
      if (filter.from) {
        query.date.$gte = filter.from;
      }
      if (filter.to) {
        query.date.$lte = filter.to;
      }
    }

    return Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .exec();
  },
};
