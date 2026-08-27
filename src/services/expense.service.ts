import { expenseRepository } from "../repositories/expense.repository.js";
import { messageRepository } from "../repositories/message.repository.js";
import type {
  CreateExpenseInput,
  SearchExpensesInput,
  UpdateExpenseInput,
} from "../schemas/expense.schema.js";
import type { ExpenseDocument } from "../models/expense.model.js";
import { ApiError } from "../utils/api-error.js";
import { presentMoney } from "../utils/format-currency.js";
import { threadService } from "./thread.service.js";

export {
  formatCurrencyAmount,
  formatGroupedAmount,
  presentMoney,
  type FormatCurrencyOptions,
  type MoneyPresentation,
} from "../utils/format-currency.js";

export type SafeExpense = {
  id: string;
  userId: string;
  groupId?: string;
  amount: number;
  currency: string;
  formattedAmount: string;
  category: string;
  note: string;
  date: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
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
  const money = presentMoney(expense.amount, expense.currency);

  return {
    id: String(expense._id),
    userId: String(expense.userId),
    ...(expense.groupId ? { groupId: String(expense.groupId) } : {}),
    amount: money.amount,
    currency: money.currency,
    formattedAmount: money.formattedAmount,
    category: expense.category,
    note: expense.note,
    date: toDateOnlyString(expense.date),
    ...(expense.sourceThreadId
      ? { sourceThreadId: String(expense.sourceThreadId) }
      : {}),
    ...(expense.sourceMessageId
      ? { sourceMessageId: String(expense.sourceMessageId) }
      : {}),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export const expenseService = {
  async create(userId: string, input: CreateExpenseInput): Promise<SafeExpense> {
    const expense = await expenseRepository.create({
      userId,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      note: input.note,
      date: startOfUtcDay(input.date),
    });

    return toSafeExpense(expense);
  },

  /**
   * Creates an expense linked to a chat message. Reserved for agentic AI tools —
   * not exposed on public REST routes yet.
   */
  async createFromChat(
    userId: string,
    threadId: string,
    messageId: string,
    input: CreateExpenseInput,
  ): Promise<SafeExpense> {
    const thread = await threadService.requireAccessibleThread(
      userId,
      threadId,
    );

    const message = await messageRepository.findByIdForThread(
      messageId,
      threadId,
      userId,
    );

    if (!message) {
      throw ApiError.notFound("Message not found");
    }

    const expense = await expenseRepository.create({
      userId,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      note: input.note,
      date: startOfUtcDay(input.date),
      sourceThreadId: threadId,
      sourceMessageId: messageId,
      ...(thread.type === "group" && thread.groupId
        ? { groupId: String(thread.groupId) }
        : {}),
    });

    await messageRepository.addExpenseId(
      messageId,
      threadId,
      userId,
      String(expense._id),
    );

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
      currency?: string;
      category?: string;
      note?: string;
      date?: Date;
    } = {};

    if (input.amount !== undefined) {
      updates.amount = input.amount;
    }
    if (input.currency !== undefined) {
      updates.currency = input.currency;
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
