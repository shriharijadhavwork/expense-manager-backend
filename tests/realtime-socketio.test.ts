import http from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

process.env["NODE_ENV"] = "test";
process.env["PORT"] = "5050";
process.env["JWT_SECRET"] = "test-jwt-secret-16chars";
process.env["JWT_EXPIRES_IN"] = "1h";
process.env["FRONTEND_URL"] = "http://localhost:3000";
process.env["MONGODB_URI"] = "mongodb://127.0.0.1:27017/expense-manager-test";
process.env["CLOUDINARY_CLOUD_NAME"] = "test-cloud";
process.env["CLOUDINARY_API_KEY"] = "test-key";
process.env["CLOUDINARY_API_SECRET"] = "test-secret";

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let createSocketIoRealtimeAdapter: typeof import("../src/realtime/index.js").createSocketIoRealtimeAdapter;
let realtimePublisher: typeof import("../src/realtime/index.js").realtimePublisher;

type AuthResponse = {
  success: true;
  data: {
    user: { id: string; name: string; email: string };
    token: string;
  };
};

type ResolveResponse = {
  success: true;
  data: {
    group: { id: string };
    thread: { id: string };
  };
};

async function signup(
  name: string,
  email: string,
  password = "password123",
): Promise<AuthResponse["data"]> {
  const response = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name, email, password })
    .expect(201);

  return (response.body as AuthResponse).data;
}

function connectClient(baseUrl: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { token },
      autoConnect: false,
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => reject(error));
    socket.connect();
  });
}

function emitWithAck<T>(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(3000)
      .emit(event, payload, (error: Error | null, response: T) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
  });
}

describe("Socket.IO realtime adapter (Batch R1)", () => {
  let httpServer: http.Server;
  let baseUrl: string;
  let socketAdapter: Awaited<
    ReturnType<typeof createSocketIoRealtimeAdapter>
  >;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const realtimeModule = await import("../src/realtime/index.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    createSocketIoRealtimeAdapter =
      realtimeModule.createSocketIoRealtimeAdapter;
    realtimePublisher = realtimeModule.realtimePublisher;
    app = appModule.createApp();

    await connectDatabase();

    httpServer = http.createServer(app);
    socketAdapter = createSocketIoRealtimeAdapter(httpServer);
    realtimePublisher.register(socketAdapter);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test HTTP server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    realtimePublisher.unregister(socketAdapter);
    await socketAdapter.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("rejects connections without a JWT", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const socket = ioClient(baseUrl, {
          path: "/socket.io",
          transports: ["websocket"],
          autoConnect: false,
        });
        socket.once("connect", () => {
          socket.disconnect();
          reject(new Error("should not connect"));
        });
        socket.once("connect_error", () => {
          socket.disconnect();
          resolve();
        });
        socket.connect();
      }),
    ).resolves.toBeUndefined();
  });

  it("allows join + receives message.created for an accessible thread", async () => {
    const alice = await signup("Alice", "alice-rt@example.com");
    const bob = await signup("Bob", "bob-rt@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const threadId = (resolved.body as ResolveResponse).data.thread.id;

    const aliceSocket = await connectClient(baseUrl, alice.token);
    const bobSocket = await connectClient(baseUrl, bob.token);

    const aliceJoin = await emitWithAck<{ ok: boolean; error?: string }>(
      aliceSocket,
      "thread:join",
      { threadId },
    );
    const bobJoin = await emitWithAck<{ ok: boolean; error?: string }>(
      bobSocket,
      "thread:join",
      { threadId },
    );

    expect(aliceJoin.ok).toBe(true);
    expect(bobJoin.ok).toBe(true);

    const eventPayload = {
      type: "message.created" as const,
      threadId,
      message: {
        id: "msg-rt-1",
        threadId,
        userId: alice.user.id,
        role: "user" as const,
        content: "live ping",
        attachmentIds: [],
        expenseIds: [],
        createdAt: new Date().toISOString(),
      },
    };

    const bobReceived = new Promise<typeof eventPayload>((resolve) => {
      bobSocket.once("message.created", (payload) => {
        resolve(payload as typeof eventPayload);
      });
    });

    await realtimePublisher.publish(eventPayload);

    await expect(bobReceived).resolves.toMatchObject({
      type: "message.created",
      threadId,
      message: { content: "live ping" },
    });

    aliceSocket.disconnect();
    bobSocket.disconnect();
  });

  it("publishes message.created after REST message create", async () => {
    const alice = await signup("Alice", "alice-rest-rt@example.com");
    const bob = await signup("Bob", "bob-rest-rt@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const threadId = (resolved.body as ResolveResponse).data.thread.id;

    const bobSocket = await connectClient(baseUrl, bob.token);
    const join = await emitWithAck<{ ok: boolean }>(bobSocket, "thread:join", {
      threadId,
    });
    expect(join.ok).toBe(true);

    const bobReceived = new Promise<{
      type: string;
      threadId: string;
      message: { content: string; role: string };
    }>((resolve) => {
      bobSocket.once("message.created", (payload) => {
        resolve(
          payload as {
            type: string;
            threadId: string;
            message: { content: string; role: string };
          },
        );
      });
    });

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ content: "hello from REST" })
      .expect(201);

    await expect(bobReceived).resolves.toMatchObject({
      type: "message.created",
      threadId,
      message: { content: "hello from REST", role: "user" },
    });

    bobSocket.disconnect();
  });

  it("rejects thread:join when the user cannot access the thread", async () => {
    const alice = await signup("Alice", "alice-deny@example.com");
    const bob = await signup("Bob", "bob-deny@example.com");
    const carol = await signup("Carol", "carol-deny@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const threadId = (resolved.body as ResolveResponse).data.thread.id;
    const carolSocket = await connectClient(baseUrl, carol.token);

    const join = await emitWithAck<{ ok: boolean; error?: string }>(
      carolSocket,
      "thread:join",
      { threadId },
    );

    expect(join.ok).toBe(false);
    expect(join.error).toBeTruthy();

    carolSocket.disconnect();
  });
});
