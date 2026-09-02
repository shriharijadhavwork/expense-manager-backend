import { Router } from "express";
import { expenseController } from "../controllers/expense.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  createExpenseSchema,
  expenseIdParamsSchema,
  searchExpensesSchema,
  updateExpenseSchema,
} from "../schemas/expense.schema.js";

const expenseRouter = Router();

expenseRouter.use(authenticate);

expenseRouter.post(
  "/",
  validateRequest(createExpenseSchema),
  expenseController.create,
);

expenseRouter.get("/", expenseController.list);

expenseRouter.get("/categories", expenseController.listCategories);

expenseRouter.post(
  "/search",
  validateRequest(searchExpensesSchema),
  expenseController.search,
);

expenseRouter.get(
  "/:id",
  validateRequest(expenseIdParamsSchema, "params"),
  expenseController.getById,
);

expenseRouter.patch(
  "/:id",
  validateRequest(expenseIdParamsSchema, "params"),
  validateRequest(updateExpenseSchema),
  expenseController.update,
);

expenseRouter.delete(
  "/:id",
  validateRequest(expenseIdParamsSchema, "params"),
  expenseController.remove,
);

export { expenseRouter };
