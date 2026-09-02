import { Router } from "express";
import { aiController } from "../controllers/ai.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { aiExecutionsQuerySchema, aiRunSchema } from "../schemas/ai.schema.js";

const aiRouter = Router();

aiRouter.use(authenticate);

aiRouter.get("/health", aiController.health);

aiRouter.post(
  "/run",
  validateRequest(aiRunSchema),
  aiController.run,
);

aiRouter.get(
  "/executions",
  validateRequest(aiExecutionsQuerySchema, "query"),
  aiController.executions,
);

export { aiRouter };
