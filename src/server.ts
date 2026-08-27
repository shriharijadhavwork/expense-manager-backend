import http from "node:http";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import {
  createSocketIoRealtimeAdapter,
  realtimePublisher,
} from "./realtime/index.js";

async function start(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  const socketAdapter = createSocketIoRealtimeAdapter(server);
  realtimePublisher.register(socketAdapter);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.PORT, () => {
      server.off("error", reject);
      console.log(
        `Server listening on port ${String(env.PORT)} (${env.NODE_ENV})`,
      );
      console.log(
        `Realtime Socket.IO attached (path=/socket.io, cors=${env.FRONTEND_URL})`,
      );
      resolve();
    });
  });

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`${signal} received. Shutting down gracefully...`);

    try {
      realtimePublisher.unregister(socketAdapter);
      await socketAdapter.close();
    } catch (error) {
      console.error("Error while closing Socket.IO", error);
    }

    server.close(async (closeError) => {
      if (closeError) {
        console.error("Error while closing HTTP server");
      }

      try {
        await disconnectDatabase();
        process.exit(0);
      } catch {
        console.error("Error during shutdown");
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
