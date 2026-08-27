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
  relation?: string | null;
  addedBy: string | null;
};

type GroupResponse = {
  success: true;
  data: {
    id: string;
    name: string;
    createdBy: string;
    members: GroupMember[];
  };
};

type InviteResponse = {
  success: true;
  data: {
    id: string;
    groupId: string;
    email: string;
    invitedBy: string;
    relation: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    expiresAt: string;
    inviteUrl: string | null;
    acceptedAt: string | null;
    acceptedBy: string | null;
  };
};

type InviteListResponse = {
  success: true;
  data: InviteResponse["data"][];
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

function tokenFromInviteUrl(inviteUrl: string): string {
  const parts = inviteUrl.split("/");
  const token = parts[parts.length - 1];
  if (!token) {
    throw new Error("Invite URL missing token");
  }
  return token;
}

describe("Group invite API (Batch 3)", () => {
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

  it("allows owner to create an email invite with a shareable URL", async () => {
    const alice = await signup("Alice", "alice-invite@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const response = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: "bob-invite@example.com", relation: "friend" })
      .expect(201);

    const body = response.body as InviteResponse;
    expect(body.data.email).toBe("bob-invite@example.com");
    expect(body.data.status).toBe("pending");
    expect(body.data.relation).toBe("friend");
    expect(body.data.invitedBy).toBe(alice.user.id);
    expect(body.data.inviteUrl).toMatch(
      /^http:\/\/localhost:3000\/invites\/[a-f0-9]{64}$/,
    );
  });

  it("allows anyone to preview a pending invite without auth", async () => {
    const alice = await signup("Alice", "alice-preview@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Trip" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: "preview-user@example.com", relation: "friend" })
      .expect(201);

    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    const preview = await request(app)
      .get(`/api/v1/invites/${token}`)
      .expect(200);

    expect(preview.body).toMatchObject({
      success: true,
      data: {
        email: "preview-user@example.com",
        groupName: "Trip",
        status: "pending",
        relation: "friend",
        relationLabel: "Friend",
        invitedByName: "Alice",
        invitedByEmail: "alice-preview@example.com",
      },
    });
  });

  it("creates a direct invite group for an email without an account", async () => {
    const alice = await signup("Alice", "alice-direct@example.com");

    const response = await request(app)
      .post("/api/v1/invites/direct")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: "newcomer@example.com", relation: "colleague" })
      .expect(201);

    const body = response.body as InviteResponse;
    expect(body.data.email).toBe("newcomer@example.com");
    expect(body.data.relation).toBe("colleague");
    expect(body.data.status).toBe("pending");
    expect(body.data.inviteUrl).toMatch(
      /^http:\/\/localhost:3000\/invites\/[a-f0-9]{64}$/,
    );

    const group = await request(app)
      .get(`/api/v1/groups/${body.data.groupId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((group.body as GroupResponse).data.members).toHaveLength(1);
  });

  it("rejects direct invite when the email already has an account", async () => {
    const alice = await signup("Alice", "alice-direct-exists@example.com");
    const bob = await signup("Bob", "bob-direct-exists@example.com");

    const response = await request(app)
      .post("/api/v1/invites/direct")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
    });
  });

  it("copies relation onto membership when an invite is accepted", async () => {
    const alice = await signup("Alice", "alice-relation@example.com");
    const bob = await signup("Bob", "bob-relation@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Roommates" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "roommate" })
      .expect(201);

    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    const accepted = await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const bobMember = (accepted.body as GroupResponse).data.members.find(
      (m) => m.userId === bob.user.id,
    );
    expect(bobMember?.relation).toBe("roommate");
  });

  it("accepts an invite and adds the user as a member", async () => {
    const alice = await signup("Alice", "alice-accept@example.com");
    const bob = await signup("Bob", "bob-accept@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(201);

    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    const accepted = await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const group = (accepted.body as GroupResponse).data;
    expect(group.id).toBe(groupId);
    expect(group.members).toHaveLength(2);
    const bobMember = group.members.find((m) => m.userId === bob.user.id);
    expect(bobMember?.role).toBe("member");
    expect(bobMember?.addedBy).toBe(alice.user.id);
  });

  it("rejects accept when the logged-in email does not match the invite", async () => {
    const alice = await signup("Alice", "alice-mismatch@example.com");
    const bob = await signup("Bob", "bob-mismatch@example.com");
    const carol = await signup("Carol", "carol-mismatch@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(201);

    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${carol.token}`)
      .expect(403);
  });

  it("forbids non-owners from creating invites", async () => {
    const alice = await signup("Alice", "alice-invite-forbid@example.com");
    const bob = await signup("Bob", "bob-invite-forbid@example.com");

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
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ email: "outsider@example.com", relation: "friend" })
      .expect(403);
  });

  it("revokes a pending invite", async () => {
    const alice = await signup("Alice", "alice-revoke@example.com");
    const bob = await signup("Bob", "bob-revoke@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(201);

    const inviteId = (invite.body as InviteResponse).data.id;
    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    const revoked = await request(app)
      .delete(`/api/v1/groups/${groupId}/invites/${inviteId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((revoked.body as InviteResponse).data.status).toBe("revoked");
    expect((revoked.body as InviteResponse).data.inviteUrl).toBeNull();

    await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(400);
  });

  it("rejects expired invites", async () => {
    const alice = await signup("Alice", "alice-expire@example.com");
    const bob = await signup("Bob", "bob-expire@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(201);

    const inviteBody = (invite.body as InviteResponse).data;
    const token = tokenFromInviteUrl(inviteBody.inviteUrl!);

    const { GroupInvite } = await import(
      "../src/models/group-invite.model.js"
    );
    await GroupInvite.findByIdAndUpdate(inviteBody.id, {
      $set: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(400);
  });

  it("refreshes a pending invite for the same email", async () => {
    const alice = await signup("Alice", "alice-refresh@example.com");

    const created = await request(app)
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Family" })
      .expect(201);

    const groupId = (created.body as GroupResponse).data.id;

    const first = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: "repeat@example.com", relation: "friend" })
      .expect(201);

    const second = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: "repeat@example.com", relation: "friend" })
      .expect(201);

    const firstData = (first.body as InviteResponse).data;
    const secondData = (second.body as InviteResponse).data;

    expect(secondData.id).toBe(firstData.id);
    expect(secondData.inviteUrl).not.toBe(firstData.inviteUrl);

    const listed = await request(app)
      .get(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect((listed.body as InviteListResponse).data).toHaveLength(1);
  });

  it("rejects inviting an existing active member", async () => {
    const alice = await signup("Alice", "alice-member-invite@example.com");
    const bob = await signup("Bob", "bob-member-invite@example.com");

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
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(409);
  });

  it("reactivates a former member who accepts an invite", async () => {
    const alice = await signup("Alice", "alice-rejoin@example.com");
    const bob = await signup("Bob", "bob-rejoin@example.com");

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

    const invite = await request(app)
      .post(`/api/v1/groups/${groupId}/invites`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ email: bob.user.email, relation: "friend" })
      .expect(201);

    const token = tokenFromInviteUrl(
      (invite.body as InviteResponse).data.inviteUrl!,
    );

    const accepted = await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const bobMember = (accepted.body as GroupResponse).data.members.find(
      (m) => m.userId === bob.user.id,
    );
    expect(bobMember?.role).toBe("member");
    expect(bobMember?.addedBy).toBe(alice.user.id);
  });
});
