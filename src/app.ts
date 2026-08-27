import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";
import { apiV1Router } from "./routes/index.js";
import { resolveRealtimeCorsOrigins } from "./realtime/cors-origins.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: resolveRealtimeCorsOrigins(env.FRONTEND_URL),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
