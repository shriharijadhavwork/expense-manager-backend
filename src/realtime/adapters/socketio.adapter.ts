import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { env } from "../../config/env.js";
import { threadService } from "../../services/thread.service.js";
import { ApiError } from "../../utils/api-error.js";
import { verifyAccessToken } from "../../utils/jwt.js";
import {
  isAllowedRealtimeOrigin,
  resolveRealtimeCorsOrigins,
} from "../cors-origins.js";
import { JoinThrottle } from "../join-throttle.js";
import type { RealtimeAdapter, RealtimeEvent } from "../types.js";
import { threadRoomId } from "../types.js";

type SocketData = {
  userId: string;
};

const JOIN_RATE_LIMIT_MESSAGE =
  "Too many room joins. Please wait a moment and try again.";

function extractToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === "string" && auth.token.trim()) {
    return auth.token.trim();
  }

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function readThreadId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const threadId = (payload as { threadId?: unknown }).threadId;
  if (typeof threadId !== "string") {
    return null;
  }
  const trimmed = threadId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type SocketIoRealtimeAdapter = RealtimeAdapter & {
  io: Server;
  close(): Promise<void>;
};

/**
 * In-process Socket.IO adapter. Clients authenticate with JWT, then
 * `thread:join` / `thread:leave` rooms after access checks.
 */
export function createSocketIoRealtimeAdapter(
  httpServer: HttpServer,
): SocketIoRealtimeAdapter {
  const allowedOrigins = resolveRealtimeCorsOrigins(env.FRONTEND_URL);
  const joinThrottle = new JoinThrottle();

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: (origin, callback) => {
        // Browsers send Origin on cross-origin WS; Node clients/tests may omit it.
        if (!origin || isAllowedRealtimeOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS not allowed"));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }

      const payload = verifyAccessToken(token);
      (socket.data as SocketData).userId = payload.sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket.data as SocketData).userId;

    socket.on("thread:join", (payload: unknown, ack?: (result: unknown) => void) => {
      void (async () => {
        if (!joinThrottle.tryConsume(socket.id)) {
          ack?.({ ok: false, error: JOIN_RATE_LIMIT_MESSAGE });
          return;
        }

        const threadId = readThreadId(payload);
        if (!threadId) {
          ack?.({ ok: false, error: "threadId is required" });
          return;
        }

        try {
          await threadService.requireAccessibleThread(userId, threadId);
          await socket.join(threadRoomId(threadId));
          ack?.({ ok: true, threadId });
        } catch (error) {
          const message =
            error instanceof ApiError ? error.message : "Unable to join thread";
          ack?.({ ok: false, error: message });
        }
      })();
    });

    socket.on("thread:leave", (payload: unknown, ack?: (result: unknown) => void) => {
      void (async () => {
        const threadId = readThreadId(payload);
        if (!threadId) {
          ack?.({ ok: false, error: "threadId is required" });
          return;
        }

        await socket.leave(threadRoomId(threadId));
        ack?.({ ok: true, threadId });
      })();
    });

    socket.on("disconnect", () => {
      joinThrottle.clear(socket.id);
    });
  });

  const adapter: SocketIoRealtimeAdapter = {
    name: "socketio",
    io,
    publish(event: RealtimeEvent) {
      io.to(threadRoomId(event.threadId)).emit(event.type, event);
    },
    async close() {
      io.disconnectSockets(true);
      io.engine.close();
    },
  };

  return adapter;
}
