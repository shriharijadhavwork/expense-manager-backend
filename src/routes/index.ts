import { Router } from "express";
import { isDatabaseConnected } from "../config/database.js";
import { authRouter } from "./auth.routes.js";
import { expenseRouter } from "./expense.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  const database = isDatabaseConnected() ? "connected" : "disconnected";

  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      database,
    },
  });
});

router.use("/auth", authRouter);
router.use("/expenses", expenseRouter);

export { router as apiV1Router };
