import { Router } from "express";
import { isDatabaseConnected } from "../config/database.js";
import { aiRouter } from "./ai.routes.js";
import { authRouter } from "./auth.routes.js";
import { expenseRouter } from "./expense.routes.js";
import { fileRouter } from "./file.routes.js";
import { groupRouter } from "./group.routes.js";
import { inviteRouter } from "./invite.routes.js";
import { threadRouter } from "./thread.routes.js";

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
router.use("/ai", aiRouter);
router.use("/expenses", expenseRouter);
router.use("/files", fileRouter);
router.use("/groups", groupRouter);
router.use("/invites", inviteRouter);
router.use("/threads", threadRouter);

export { router as apiV1Router };
