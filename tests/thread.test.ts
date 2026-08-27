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
    type: "personal" | "group";
    userId: string | null;
    groupId: string | null;
    createdBy: string;
    dayKey: string;
    sequence: number;
    title: string;
    deletedAt: string | null;
    lastActivityAt: string;
    readAt: string | null;
    unread: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessage?: {
      content: string;
      role: "user" | "assistant" | "system" | "tool";
      createdAt: string;
      hasAttachments: boolean;
    } | null;
  };
};

type ThreadListResponse = {
  success: true;
  data: ThreadResponse["data"][];
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

describe("Thread API", () => {
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

  it("creates a personal thread with dayKey/sequence default title", async () => {
    const auth = await signup("Alice", "alice-thread@example.com");

    const response = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({})
      .expect(201);

    const body = response.body as ThreadResponse;
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("personal");
    expect(body.data.userId).toBe(auth.user.id);
    expect(body.data.groupId).toBeNull();
    expect(body.data.createdBy).toBe(auth.user.id);
    expect(body.data.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.data.sequence).toBe(1);
    expect(body.data.title).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4} · Thread 1$/);
    expect(body.data.deletedAt).toBeNull();
    expect(body.data.lastActivityAt).toBeTruthy();
  });

  it("increments personal sequence for the same dayKey", async () => {
    const auth = await signup("Alice", "alice-sequence@example.com");

    const first = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({})
      .expect(201);

    const second = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({})
      .expect(201);

    const firstData = (first.body as ThreadResponse).data;
    const secondData = (second.body as ThreadResponse).data;

    expect(firstData.dayKey).toBe(secondData.dayKey);
    expect(firstData.sequence).toBe(1);
    expect(secondData.sequence).toBe(2);
    expect(secondData.title).toContain("· Thread 2");
  });

  it("creates a thread with a custom title", async () => {
    const auth = await signup("Alice", "alice-title@example.com");

    const response = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "  Paradise lunch  " })
      .expect(201);

    expect((response.body as ThreadResponse).data.title).toBe("Paradise lunch");
  });

  it("lists only the authenticated user's active threads", async () => {
    const alice = await signup("Alice", "alice-list-thread@example.com");
    const bob = await signup("Bob", "bob-list-thread@example.com");

    await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ title: "Alice thread" })
      .expect(201);

    await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ title: "Bob thread" })
      .expect(201);

    const response = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const body = response.body as ThreadListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title).toBe("Alice thread");
    expect(body.data[0]?.userId).toBe(alice.user.id);
  });

  it("orders threads by lastActivityAt descending", async () => {
    const auth = await signup("Alice", "alice-order@example.com");

    const first = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Older" })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Newer" })
      .expect(201);

    const listBeforeRename = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const before = listBeforeRename.body as ThreadListResponse;
    expect(before.data[0]?.id).toBe(
      (second.body as ThreadResponse).data.id,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    await request(app)
      .patch(`/api/v1/threads/${(first.body as ThreadResponse).data.id}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Older renamed" })
      .expect(200);

    const listAfterRename = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const after = listAfterRename.body as ThreadListResponse;
    expect(after.data[0]?.id).toBe((first.body as ThreadResponse).data.id);
    expect(after.data[0]?.title).toBe("Older renamed");
  });

  it("gets a single thread belonging to the authenticated user", async () => {
    const auth = await signup("Alice", "alice-get-thread@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Grocery" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    const response = await request(app)
      .get(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((response.body as ThreadResponse).data.title).toBe("Grocery");
  });

  it("renames a thread", async () => {
    const auth = await signup("Alice", "alice-rename@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Temp" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    const response = await request(app)
      .patch(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Office dinner" })
      .expect(200);

    expect((response.body as ThreadResponse).data.title).toBe("Office dinner");
  });

  it("moves a thread to the recycle bin via DELETE", async () => {
    const auth = await signup("Alice", "alice-delete@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "To delete" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    const deleted = await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect(deleted.body.success).toBe(true);

    const activeList = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((activeList.body as ThreadListResponse).data).toHaveLength(0);

    const recycleBin = await request(app)
      .get("/api/v1/threads/recycle-bin")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((recycleBin.body as ThreadListResponse).data).toHaveLength(1);
    expect((recycleBin.body as ThreadListResponse).data[0]?.deletedAt).toBeTruthy();
  });

  it("restores a thread from the recycle bin", async () => {
    const auth = await signup("Alice", "alice-restore@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Restore me" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const restored = await request(app)
      .post(`/api/v1/threads/${threadId}/restore`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((restored.body as ThreadResponse).data.deletedAt).toBeNull();

    const activeList = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((activeList.body as ThreadListResponse).data).toHaveLength(1);
  });

  it("permanently deletes a thread from the recycle bin", async () => {
    const auth = await signup("Alice", "alice-purge@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Purge me" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    await request(app)
      .delete(`/api/v1/threads/${threadId}/permanent`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const recycleBin = await request(app)
      .get("/api/v1/threads/recycle-bin")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((recycleBin.body as ThreadListResponse).data).toHaveLength(0);
  });

  it("rejects unauthorized access", async () => {
    await request(app).get("/api/v1/threads").expect(401);
    await request(app).post("/api/v1/threads").send({}).expect(401);
  });

  it("prevents User B from reading or updating User A's thread", async () => {
    const alice = await signup("Alice", "alice-isolation-thread@example.com");
    const bob = await signup("Bob", "bob-isolation-thread@example.com");

    const created = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ title: "Alice secret" })
      .expect(201);

    const threadId = (created.body as ThreadResponse).data.id;

    await request(app)
      .get(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .patch(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ title: "Hacked" })
      .expect(404);

    await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .get(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
  });

  it("rejects invalid thread ids and empty titles", async () => {
    const auth = await signup("Alice", "alice-validation-thread@example.com");

    await request(app)
      .get("/api/v1/threads/not-valid")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(400);

    await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "   " })
      .expect(400);
  });

  it("ignores client-supplied userId on create", async () => {
    const alice = await signup("Alice", "alice-userid-thread@example.com");
    const bob = await signup("Bob", "bob-userid-thread@example.com");

    const response = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        title: "Owned by Alice",
        userId: bob.user.id,
      })
      .expect(201);

    expect((response.body as ThreadResponse).data.userId).toBe(alice.user.id);
  });

  it("includes the latest message preview when listing threads", async () => {
    const auth = await signup("Alice", "alice-preview-thread@example.com");

    const thread = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Lunch chat" })
      .expect(201);

    const threadId = (thread.body as ThreadResponse).data.id;

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "Split the Paradise bill" })
      .expect(201);

    const list = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const body = list.body as ThreadListResponse;
    expect(body.data[0]?.lastMessage?.content).toBe("Split the Paradise bill");
    expect(body.data[0]?.lastMessage?.role).toBe("user");
    expect(body.data[0]?.lastMessage?.hasAttachments).toBe(false);
  });

  it("marks a thread as read and clears unread state", async () => {
    const auth = await signup("Alice", "alice-read@example.com");

    const thread = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Unread chat" })
      .expect(201);

    const threadId = (thread.body as ThreadResponse).data.id;

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "New activity" })
      .expect(201);

    const unreadList = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((unreadList.body as ThreadListResponse).data[0]?.unread).toBe(true);

    const readResponse = await request(app)
      .post(`/api/v1/threads/${threadId}/read`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({})
      .expect(200);

    const readBody = readResponse.body as ThreadResponse;
    expect(readBody.data.readAt).toBeTruthy();
    expect(readBody.data.unread).toBe(false);

    const readList = await request(app)
      .get("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((readList.body as ThreadListResponse).data[0]?.unread).toBe(false);
  });
});
