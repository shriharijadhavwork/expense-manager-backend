import type { Request, Response } from "express";
import { expenseService } from "../services/expense.service.js";
import type {
  CreateExpenseInput,
  ExpenseIdParams,
  SearchExpensesInput,
  UpdateExpenseInput,
} from "../schemas/expense.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

function requireUserId(req: Request): string {
  if (!req.user?.sub) {
    throw ApiError.unauthorized();
  }

  return req.user.sub;
}

export const expenseController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const expense = await expenseService.create(
      userId,
      req.body as CreateExpenseInput,
    );

    res.status(201).json({
      success: true,
      data: expense,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const expenses = await expenseService.list(userId);

    res.status(200).json({
      success: true,
      data: expenses,
    });
  }),

  search: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const expenses = await expenseService.search(
      userId,
      req.body as SearchExpensesInput,
    );

    res.status(200).json({
      success: true,
      data: expenses,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ExpenseIdParams;
    const expense = await expenseService.getById(userId, id);

    res.status(200).json({
      success: true,
      data: expense,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ExpenseIdParams;
    const expense = await expenseService.update(
      userId,
      id,
      req.body as UpdateExpenseInput,
    );

    res.status(200).json({
      success: true,
      data: expense,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ExpenseIdParams;
    await expenseService.remove(userId, id);

    res.status(200).json({
      success: true,
      data: {
        message: "Expense deleted",
      },
    });
  }),

  listCategories: asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: expenseService.listCategories(),
    });
  }),
};
