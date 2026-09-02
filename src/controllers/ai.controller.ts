import type { Request, Response } from "express";
import { graphRunnerService } from "../ai/services/graph-runner.service.js";
import { aiExecutionService } from "../ai/services/ai-execution.service.js";
import { aiService } from "../ai/services/ai.service.js";
import type { AiExecutionsQuery, AiRunInput } from "../schemas/ai.schema.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const aiController = {
  health: asyncHandler(async (req: Request, res: Response) => {
    const status = aiService.getHealthStatus();
    const shouldPing = req.query["ping"] === "true";

    if (!shouldPing) {
      res.status(200).json({
        success: true,
        data: status,
      });
      return;
    }

    if (!status.configured) {
      throw new ApiError(
        503,
        "INTERNAL_ERROR",
        "AI provider is not configured. Set GEMINI_API_KEY in .env",
      );
    }

    const ping = await aiService.ping();

    res.status(200).json({
      success: true,
      data: {
        ...status,
        ping,
      },
    });
  }),

  run: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AiRunInput;
    const result = await graphRunnerService.run({
      userId: req.user!.sub,
      threadId: body.threadId,
      messageBatch: body.messageBatch,
      trigger: "api_run",
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  executions: asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as AiExecutionsQuery;
    const executions = await aiExecutionService.listForThread(
      query.threadId,
      req.user!.sub,
      query.limit,
    );

    res.status(200).json({
      success: true,
      data: executions.map((execution) => execution.toJSON()),
    });
  }),
};
