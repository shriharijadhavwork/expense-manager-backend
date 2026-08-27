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
  id: string;
  groupId: string;
  userId: string;
  role: "owner" | "member";
  addedBy: string | null;
  joinedAt: string;
};

type GroupResponse = {
  success: true;
  data: {
    id: string;
    name: string;
    createdBy: string;
    members: GroupMember[];
    createdAt: string;
    updatedAt: string;
  };
};

type GroupListResponse = {
  success: true;
  data: GroupResponse["data"][];
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

describe("Group API (Batch 1)", () => {
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

  it("creates a group with creator as owner", async () => {
    const alice = await signup("Alice", "alice-group@example.com");

    const response = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const body = response.body as GroupResponse;
    expect(body.data.name).toBe("Family");
    expect(body.data.createdBy).toBe(alice.user.id);
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]?.userId).toBe(alice.user.id);
    expect(body.data.members[0]?.role).toBe("owner");
    expect(body.data.members[0]?.addedBy).toBeNull();
  });

  it("creates a group with additional members", async () => {
    const alice = await signup("Alice", "alice-members@example.com");
    const bob = await signup("Bob", "bob-members@example.com");

    const response = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "A & B",
        emails: [bob.user.email],
      })
      .expect(201);

    const body = response.body as GroupResponse;
    expect(body.data.members).toHaveLength(2);

    const owner = body.data.members.find((member) => member.role === "owner");
    const member = body.data.members.find((m) => m.role === "member");

    expect(owner?.userId).toBe(alice.user.id);
    expect(owner?.addedBy).toBeNull();
    expect(member?.userId).toBe(bob.user.id);
    expect(member?.addedBy).toBe(alice.user.id);
  });

  it("lists only groups the user belongs to", async () => {
    const alice = await signup("Alice", "alice-list-groups@example.com");
    const bob = await signup("Bob", "bob-list-groups@example.com");

    await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Alice Solo" })
      .expect(201);

    await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Shared",
        emails: [bob.user.email],
      })
      .expect(201);

    await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ name: "Bob Solo" })
      .expect(201);

    const aliceList = await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const bobList = await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const aliceNames = (aliceList.body as GroupListResponse).data.map(
      (group) => group.name,
    );
    const bobNames = (bobList.body as GroupListResponse).data.map(
      (group) => group.name,
    );

    expect(aliceNames.sort()).toEqual(["Alice Solo", "Shared"]);
    expect(bobNames.sort()).toEqual(["Bob Solo", "Shared"]);
  });

  it("gets a group by id for members only", async () => {
    const alice = await signup("Alice", "alice-get-group@example.com");
    const bob = await signup("Bob", "bob-get-group@example.com");
    const carol = await signup("Carol", "carol-get-group@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Trip",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${carol.token}`)
      .expect(404);
  });

  it("allows only the owner to rename a group", async () => {
    const alice = await signup("Alice", "alice-rename@example.com");
    const bob = await signup("Bob", "bob-rename@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Old Name",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const renamed = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "New Name" })
      .expect(200);

    expect((renamed.body as GroupResponse).data.name).toBe("New Name");

    const forbidden = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ name: "Hacked" })
      .expect(403);

    expect(forbidden.body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("rejects invalid emails and unauthorized access", async () => {
    const alice = await signup("Alice", "alice-invalid-group@example.com");

    await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Bad",
        emails: ["nobody@example.com"],
      })
      .expect(400);

    await request(app).get("/api/v1/groups").expect(401);

    await request(app)
      .post("/api/v1/groups")
      .send({ name: "No Auth" })
      .expect(401);
  });
});

describe("Group membership API (Batch 2)", () => {
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

  it("allows owner to add a member with addedBy set", async () => {
    const alice = await signup("Alice", "alice-add@example.com");
    const bob = await signup("Bob", "bob-add@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const response = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email })
      .expect(200);

    const body = response.body as GroupResponse;
    expect(body.data.members).toHaveLength(2);
    const bobMember = body.data.members.find((m) => m.userId === bob.user.id);
    expect(bobMember?.role).toBe("member");
    expect(bobMember?.addedBy).toBe(alice.user.id);
  });

  it("forbids non-owners from adding members", async () => {
    const alice = await signup("Alice", "alice-add-forbid@example.com");
    const bob = await signup("Bob", "bob-add-forbid@example.com");
    const carol = await signup("Carol", "carol-add-forbid@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ email: carol.user.email })
      .expect(403);
  });

  it("allows owner to remove a member", async () => {
    const alice = await signup("Alice", "alice-remove@example.com");
    const bob = await signup("Bob", "bob-remove@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const response = await request(app)
      .delete(`/api/v1/groups/${groupId}/members/${bob.user.id}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((response.body as GroupResponse).data.members).toHaveLength(1);
    expect((response.body as GroupResponse).data.members[0]?.userId).toBe(
      alice.user.id,
    );
  });

  it("allows a member to leave the group", async () => {
    const alice = await signup("Alice", "alice-leave@example.com");
    const bob = await signup("Bob", "bob-leave@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const left = await request(app)
      .post(`/api/v1/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    expect(left.body).toMatchObject({
      success: true,
      data: { dissolved: false },
    });

    await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    const stillThere = await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((stillThere.body as GroupResponse).data.members).toHaveLength(1);
  });

  it("blocks owner leave when other members exist without transfer", async () => {
    const alice = await signup("Alice", "alice-owner-leave@example.com");
    const bob = await signup("Bob", "bob-owner-leave@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    await request(app)
      .post(`/api/v1/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(400);
  });

  it("transfers ownership then allows previous owner to leave", async () => {
    const alice = await signup("Alice", "alice-transfer@example.com");
    const bob = await signup("Bob", "bob-transfer@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const transferred = await request(app)
      .post(`/api/v1/groups/${groupId}/transfer`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ userId: bob.user.id })
      .expect(200);

    const body = transferred.body as GroupResponse;
    expect(
      body.data.members.find((m) => m.userId === bob.user.id)?.role,
    ).toBe("owner");
    expect(
      body.data.members.find((m) => m.userId === alice.user.id)?.role,
    ).toBe("member");

    await request(app)
      .post(`/api/v1/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const afterLeave = await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    expect((afterLeave.body as GroupResponse).data.members).toHaveLength(1);
    expect((afterLeave.body as GroupResponse).data.members[0]?.userId).toBe(
      bob.user.id,
    );
  });

  it("dissolves group when sole owner leaves", async () => {
    const alice = await signup("Alice", "alice-dissolve@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Solo" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const left = await request(app)
      .post(`/api/v1/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect(left.body).toMatchObject({
      success: true,
      data: { dissolved: true },
    });

    await request(app)
      .get(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(404);

    const list = await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((list.body as GroupListResponse).data).toHaveLength(0);
  });

  it("reactivates a previously removed member when added again", async () => {
    const alice = await signup("Alice", "alice-reactivate@example.com");
    const bob = await signup("Bob", "bob-reactivate@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        name: "Family",
        emails: [bob.user.email],
      })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    await request(app)
      .delete(`/api/v1/groups/${groupId}/members/${bob.user.id}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const readded = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email })
      .expect(200);

    const bobMember = (readded.body as GroupResponse).data.members.find(
      (m) => m.userId === bob.user.id,
    );
    expect(bobMember?.role).toBe("member");
    expect(bobMember?.addedBy).toBe(alice.user.id);
  });
});
