import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

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

type AuthResponse = {
  success: true;
  data: {
    user: { id: string; name: string; email: string };
    token: string;
  };
};

type ThreadResponse = {
  success: true;
  data: {
    id: string;
    userId: string;
    title: string;
    deletedAt: string | null;
    lastActivityAt: string;
    createdAt: string;
    updatedAt: string;
  };
};

type MessageResponse = {
  success: true;
  data: {
    id: string;
    threadId: string;
    userId: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    attachmentIds: string[];
    createdAt: string;
  };
};

type MessageListResponse = {
  success: true;
  data: {
    items: MessageResponse["data"][];
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
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

async function createThread(
  token: string,
  title = "Test thread",
): Promise<ThreadResponse["data"]> {
  const response = await request(app)
    .post("/api/v1/threads")
    .set("Authorization", `Bearer ${token}`)
    .send({ title })
    .expect(201);

  return (response.body as ThreadResponse).data;
}

async function createMessage(
  token: string,
  threadId: string,
  content: string,
): Promise<MessageResponse["data"]> {
  const response = await request(app)
    .post(`/api/v1/threads/${threadId}/messages`)
    .set("Authorization", `Bearer ${token}`)
    .send({ content })
    .expect(201);

  return (response.body as MessageResponse).data;
}

describe("Message API", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();

    await connectDatabase();
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("creates a user message on an active thread", async () => {
    const auth = await signup("Alice", "alice-msg@example.com");
    const thread = await createThread(auth.token, "Chat");

    const response = await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "  Hello there  " })
      .expect(201);

    const body = response.body as MessageResponse;
    expect(body.success).toBe(true);
    expect(body.data.threadId).toBe(thread.id);
    expect(body.data.userId).toBe(auth.user.id);
    expect(body.data.role).toBe("user");
    expect(body.data.content).toBe("Hello there");
    expect(body.data.attachmentIds).toEqual([]);
    expect(body.data.createdAt).toBeTruthy();
  });

  it("bumps thread lastActivityAt when a message is created", async () => {
    const auth = await signup("Alice", "alice-activity@example.com");
    const thread = await createThread(auth.token);
    const before = thread.lastActivityAt;

    await new Promise((resolve) => setTimeout(resolve, 5));

    await createMessage(auth.token, thread.id, "New message");

    const threadResponse = await request(app)
      .get(`/api/v1/threads/${thread.id}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const updated = (threadResponse.body as ThreadResponse).data;
    expect(new Date(updated.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );
  });

  it("lists messages in chronological order", async () => {
    const auth = await signup("Alice", "alice-list-msg@example.com");
    const thread = await createThread(auth.token);

    const first = await createMessage(auth.token, thread.id, "First");
    const second = await createMessage(auth.token, thread.id, "Second");
    const third = await createMessage(auth.token, thread.id, "Third");

    const response = await request(app)
      .get(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const body = response.body as MessageListResponse;
    expect(body.data.items).toHaveLength(3);
    expect(body.data.items.map((item) => item.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns an empty list for a thread with no messages", async () => {
    const auth = await signup("Alice", "alice-empty-msg@example.com");
    const thread = await createThread(auth.token);

    const response = await request(app)
      .get(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const body = response.body as MessageListResponse;
    expect(body.data.items).toEqual([]);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
  });

  it("paginates older messages with before cursor", async () => {
    const auth = await signup("Alice", "alice-page-msg@example.com");
    const thread = await createThread(auth.token);

    const messages = [];
    for (let index = 1; index <= 5; index += 1) {
      messages.push(
        await createMessage(auth.token, thread.id, `Message ${index}`),
      );
    }

    const firstPage = await request(app)
      .get(`/api/v1/threads/${thread.id}/messages?limit=2`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const firstBody = firstPage.body as MessageListResponse;
    expect(firstBody.data.items).toHaveLength(2);
    expect(firstBody.data.items.map((item) => item.content)).toEqual([
      "Message 4",
      "Message 5",
    ]);
    expect(firstBody.data.hasMore).toBe(true);
    expect(firstBody.data.nextCursor).toBe(messages[3]!.id);

    const secondPage = await request(app)
      .get(
        `/api/v1/threads/${thread.id}/messages?limit=2&before=${firstBody.data.nextCursor}`,
      )
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const secondBody = secondPage.body as MessageListResponse;
    expect(secondBody.data.items.map((item) => item.content)).toEqual([
      "Message 2",
      "Message 3",
    ]);
    expect(secondBody.data.hasMore).toBe(true);

    const thirdPage = await request(app)
      .get(
        `/api/v1/threads/${thread.id}/messages?limit=2&before=${secondBody.data.nextCursor}`,
      )
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const thirdBody = thirdPage.body as MessageListResponse;
    expect(thirdBody.data.items.map((item) => item.content)).toEqual([
      "Message 1",
    ]);
    expect(thirdBody.data.hasMore).toBe(false);
    expect(thirdBody.data.nextCursor).toBeNull();
  });

  it("rejects invalid cursor with 400", async () => {
    const auth = await signup("Alice", "alice-bad-cursor@example.com");
    const thread = await createThread(auth.token);

    const response = await request(app)
      .get(
        `/api/v1/threads/${thread.id}/messages?before=${new mongoose.Types.ObjectId().toString()}`,
      )
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(400);

    const body = response.body as ErrorResponse;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid cursor");
  });

  it("rejects messages on deleted threads", async () => {
    const auth = await signup("Alice", "alice-deleted-msg@example.com");
    const thread = await createThread(auth.token);

    await request(app)
      .delete(`/api/v1/threads/${thread.id}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const response = await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "Should fail" })
      .expect(400);

    const body = response.body as ErrorResponse;
    expect(body.error.message).toBe(
      "In Recycle Bin — restore to continue",
    );
  });

  it("allows reading messages on deleted threads in the recycle bin", async () => {
    const auth = await signup("Alice", "alice-read-deleted@example.com");
    const thread = await createThread(auth.token);
    await createMessage(auth.token, thread.id, "Saved message");

    await request(app)
      .delete(`/api/v1/threads/${thread.id}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const response = await request(app)
      .get(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const body = response.body as MessageListResponse;
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]?.content).toBe("Saved message");
  });

  it("returns 404 when thread does not belong to the user", async () => {
    const alice = await signup("Alice", "alice-thread-owner@example.com");
    const bob = await signup("Bob", "bob-thread-owner@example.com");
    const thread = await createThread(alice.token);

    await request(app)
      .get(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ content: "Intrusion" })
      .expect(404);
  });

  it("returns 404 for a missing thread", async () => {
    const auth = await signup("Alice", "alice-missing-thread@example.com");
    const missingId = new mongoose.Types.ObjectId().toString();

    await request(app)
      .get(`/api/v1/threads/${missingId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(404);
  });

  it("requires authentication", async () => {
    const auth = await signup("Alice", "alice-auth-msg@example.com");
    const thread = await createThread(auth.token);

    await request(app)
      .get(`/api/v1/threads/${thread.id}/messages`)
      .expect(401);

    await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .send({ content: "No auth" })
      .expect(401);
  });

  it("validates message content", async () => {
    const auth = await signup("Alice", "alice-validate-msg@example.com");
    const thread = await createThread(auth.token);

    await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "   " })
      .expect(400);
  });
});
