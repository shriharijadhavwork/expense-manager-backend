import { expenseRepository } from "../repositories/expense.repository.js";
import type {
  CreateExpenseInput,
  SearchExpensesInput,
  UpdateExpenseInput,
} from "../schemas/expense.schema.js";
import type { ExpenseDocument } from "../models/expense.model.js";
import { ApiError } from "../utils/api-error.js";

export type SafeExpense = {
  id: string;
  userId: string;
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

function startOfUtcDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function endOfUtcDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999Z`);
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSafeExpense(expense: ExpenseDocument): SafeExpense {
  return {
    id: String(expense._id),
    userId: String(expense.userId),
    amount: expense.amount,
    category: expense.category,
    note: expense.note,
    date: toDateOnlyString(expense.date),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export const expenseService = {
  async create(userId: string, input: CreateExpenseInput): Promise<SafeExpense> {
    const expense = await expenseRepository.create({
      userId,
      amount: input.amount,
      category: input.category,
      note: input.note,
      date: startOfUtcDay(input.date),
    });

    return toSafeExpense(expense);
  },

  async list(userId: string): Promise<SafeExpense[]> {
    const expenses = await expenseRepository.findAllByUserId(userId);
    return expenses.map(toSafeExpense);
  },

  async getById(userId: string, expenseId: string): Promise<SafeExpense> {
    const expense = await expenseRepository.findByIdForUser(expenseId, userId);

    if (!expense) {
      throw ApiError.notFound("Expense not found");
    }

    return toSafeExpense(expense);
  },

  async update(
    userId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<SafeExpense> {
    const updates: {
      amount?: number;
      category?: string;
      note?: string;
      date?: Date;
    } = {};

    if (input.amount !== undefined) {
      updates.amount = input.amount;
    }
    if (input.category !== undefined) {
      updates.category = input.category;
    }
    if (input.note !== undefined) {
      updates.note = input.note;
    }
    if (input.date !== undefined) {
      updates.date = startOfUtcDay(input.date);
    }

    const expense = await expenseRepository.updateByIdForUser(
      expenseId,
      userId,
      updates,
    );

    if (!expense) {
      throw ApiError.notFound("Expense not found");
    }

    return toSafeExpense(expense);
  },

  async remove(userId: string, expenseId: string): Promise<void> {
    const expense = await expenseRepository.deleteByIdForUser(
      expenseId,
      userId,
    );

    if (!expense) {
      throw ApiError.notFound("Expense not found");
    }
  },

  async search(
    userId: string,
    input: SearchExpensesInput,
  ): Promise<SafeExpense[]> {
    const expenses = await expenseRepository.searchForUser({
      userId,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.from !== undefined ? { from: startOfUtcDay(input.from) } : {}),
      ...(input.to !== undefined ? { to: endOfUtcDay(input.to) } : {}),
    });

    return expenses.map(toSafeExpense);
  },
};
