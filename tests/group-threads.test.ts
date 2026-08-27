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

type GroupMember = {
  userId: string;
  role: "owner" | "member";
};

type GroupData = {
  id: string;
  name: string;
  members: GroupMember[];
};

type ThreadData = {
  id: string;
  type: "personal" | "group";
  userId: string | null;
  groupId: string | null;
  createdBy: string;
  dayKey: string;
  sequence: number;
  title: string;
  deletedAt?: string | null;
  canManageRecycle?: boolean;
};

type ResolveResponse = {
  success: true;
  data: {
    group: GroupData;
    thread: ThreadData;
    created: boolean;
  };
};

type ThreadListResponse = {
  success: true;
  data: ThreadData[];
};

type MessageListResponse = {
  success: true;
  data: {
    items: Array<{ id: string; content: string; userId: string; role: string }>;
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

describe("Group threads API (Batch 5)", () => {
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

  it("resolves A+B into a new group and thread", async () => {
    const alice = await signup("Alice", "alice-resolve@example.com");
    const bob = await signup("Bob", "bob-resolve@example.com");

    const response = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const body = response.body as ResolveResponse;
    expect(body.data.created).toBe(true);
    expect(body.data.group.members).toHaveLength(2);
    expect(body.data.thread.type).toBe("group");
    expect(body.data.thread.groupId).toBe(body.data.group.id);
    expect(body.data.thread.userId).toBeNull();
    expect(body.data.thread.createdBy).toBe(alice.user.id);
    expect(body.data.thread.sequence).toBe(1);
  });

  it("reuses the exact member-set group and creates a new thread on second resolve", async () => {
    const alice = await signup("Alice", "alice-reuse@example.com");
    const bob = await signup("Bob", "bob-reuse@example.com");

    const first = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const second = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ emails: [alice.user.email] })
      .expect(200);

    const firstBody = first.body as ResolveResponse;
    const secondBody = second.body as ResolveResponse;

    expect(secondBody.data.created).toBe(false);
    expect(secondBody.data.group.id).toBe(firstBody.data.group.id);
    expect(secondBody.data.thread.id).not.toBe(firstBody.data.thread.id);
    expect(secondBody.data.thread.sequence).toBe(2);
  });

  it("allows members to create and list group threads", async () => {
    const alice = await signup("Alice", "alice-gthreads@example.com");
    const bob = await signup("Bob", "bob-gthreads@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family", emails: [bob.user.email] })
      .expect(201);

    const groupId = (created.body as { data: GroupData }).data.id;

    const thread = await request(app)
      .post(`/api/v1/groups/${groupId}/threads`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({})
      .expect(201);

    expect((thread.body as { data: ThreadData }).data.type).toBe("group");
    expect((thread.body as { data: ThreadData }).data.groupId).toBe(groupId);

    const listed = await request(app)
      .get(`/api/v1/groups/${groupId}/threads`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((listed.body as ThreadListResponse).data).toHaveLength(1);
  });

  it("lets group members exchange messages; outsiders cannot", async () => {
    const alice = await signup("Alice", "alice-gmsg@example.com");
    const bob = await signup("Bob", "bob-gmsg@example.com");
    const carol = await signup("Carol", "carol-gmsg@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const threadId = (resolved.body as ResolveResponse).data.thread.id;

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ content: "Hello Bob" })
      .expect(201);

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ content: "Hi Alice" })
      .expect(201);

    const bobList = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    expect((bobList.body as MessageListResponse).data.items).toHaveLength(2);

    await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${carol.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${carol.token}`)
      .send({ content: "Nope" })
      .expect(404);
  });

  it("keeps personal threads private from group peers", async () => {
    const alice = await signup("Alice", "alice-private@example.com");
    const bob = await signup("Bob", "bob-private@example.com");

    await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const personal = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ title: "Alice only" })
      .expect(201);

    const personalId = (personal.body as { data: ThreadData }).data.id;

    await request(app)
      .get(`/api/v1/threads/${personalId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .get(`/api/v1/threads/${personalId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);
  });

  it("sets groupId on expenses created from a group thread", async () => {
    const alice = await signup("Alice", "alice-gexpense@example.com");
    const bob = await signup("Bob", "bob-gexpense@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const { group, thread } = (resolved.body as ResolveResponse).data;

    const message = await request(app)
      .post(`/api/v1/threads/${thread.id}/messages`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ content: "Paid for dinner" })
      .expect(201);

    const messageId = (
      message.body as { success: true; data: { id: string } }
    ).data.id;

    const { expenseService } = await import(
      "../src/services/expense.service.js"
    );
    const expense = await expenseService.createFromChat(
      alice.user.id,
      thread.id,
      messageId,
      {
        amount: 1200,
        currency: "INR",
        category: "food",
        note: "Dinner",
        date: "2026-08-26",
      },
    );

    expect(expense.groupId).toBe(group.id);
    expect(expense.sourceThreadId).toBe(thread.id);
  });

  it("forbids non-members from listing group threads", async () => {
    const alice = await signup("Alice", "alice-forbid-list@example.com");
    const bob = await signup("Bob", "bob-forbid-list@example.com");
    const carol = await signup("Carol", "carol-forbid-list@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "AB", emails: [bob.user.email] })
      .expect(201);

    const groupId = (created.body as { data: GroupData }).data.id;

    await request(app)
      .get(`/api/v1/groups/${groupId}/threads`)
      .set("Authorization", `Bearer ${carol.token}`)
      .expect(404);
  });

  it("soft-deletes a group thread, blocks messages, and restores it", async () => {
    const alice = await signup("Alice", "alice-grecycle@example.com");
    const bob = await signup("Bob", "bob-grecycle@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const threadId = (resolved.body as ResolveResponse).data.thread.id;
    const groupId = (resolved.body as ResolveResponse).data.group.id;

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ content: "Keep me" })
      .expect(201);

    await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const active = await request(app)
      .get(`/api/v1/groups/${groupId}/threads`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    expect((active.body as ThreadListResponse).data).toHaveLength(0);

    const recycle = await request(app)
      .get("/api/v1/threads/recycle-bin")
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const recycled = (recycle.body as ThreadListResponse).data;
    expect(recycled).toHaveLength(1);
    expect(recycled[0]?.id).toBe(threadId);
    expect(recycled[0]?.type).toBe("group");
    expect(recycled[0]?.canManageRecycle).toBe(false);

    const aliceRecycle = await request(app)
      .get("/api/v1/threads/recycle-bin")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect(
      (aliceRecycle.body as ThreadListResponse).data[0]?.canManageRecycle,
    ).toBe(true);

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ content: "Should fail" })
      .expect(400);

    await request(app)
      .post(`/api/v1/threads/${threadId}/restore`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(403);

    const restored = await request(app)
      .post(`/api/v1/threads/${threadId}/restore`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((restored.body as { data: ThreadData }).data.deletedAt).toBeNull();

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ content: "Back again" })
      .expect(201);
  });

  it("allows group owner to delete a thread they did not create", async () => {
    const alice = await signup("Alice", "alice-owner-del@example.com");
    const bob = await signup("Bob", "bob-owner-del@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family", emails: [bob.user.email] })
      .expect(201);

    const groupId = (created.body as { data: GroupData }).data.id;

    const thread = await request(app)
      .post(`/api/v1/groups/${groupId}/threads`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({})
      .expect(201);

    const threadId = (thread.body as { data: ThreadData }).data.id;

    await request(app)
      .delete(`/api/v1/threads/${threadId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const recycle = await request(app)
      .get("/api/v1/threads/recycle-bin")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((recycle.body as ThreadListResponse).data[0]?.id).toBe(threadId);
  });

  it("posts a system message when a member is added", async () => {
    const alice = await signup("Alice", "alice-sysmsg@example.com");
    const bob = await signup("Bob", "bob-sysmsg@example.com");

    const resolved = await request(app)
      .post("/api/v1/groups/resolve")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ emails: [bob.user.email] })
      .expect(201);

    const groupId = (resolved.body as ResolveResponse).data.group.id;
    const threadId = (resolved.body as ResolveResponse).data.thread.id;
    const carol = await signup("Carol", "carol-sysmsg@example.com");

    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: carol.user.email })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const messages = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const items = (messages.body as MessageListResponse).data.items;
    expect(
      items.some(
        (item) =>
          item.role === "system" && item.content.includes("added Carol"),
      ),
    ).toBe(true);
  });
});
