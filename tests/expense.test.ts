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

type ExpenseResponse = {
  success: true;
  data: {
    id: string;
    userId: string;
    amount: number;
    currency: string;
    formattedAmount: string;
    category: string;
    note: string;
    date: string;
  };
};

type ExpenseListResponse = {
  success: true;
  data: Array<{
    id: string;
    userId: string;
    amount: number;
    currency: string;
    formattedAmount: string;
    category: string;
    note: string;
    date: string;
  }>;
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

describe("Expense API", () => {
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

  it("creates an expense for the authenticated user", async () => {
    const auth = await signup("Alice", "alice@example.com");

    const response = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 500,
        currency: "INR",
        category: "Food",
        note: "Lunch",
        date: "2026-08-24",
      })
      .expect(201);

    const body = response.body as ExpenseResponse;
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(auth.user.id);
    expect(body.data.amount).toBe(500);
    expect(body.data.currency).toBe("INR");
    expect(body.data.formattedAmount).toBe("500");
    expect(body.data.category).toBe("food");
    expect(body.data.note).toBe("Lunch");
    expect(body.data.date).toBe("2026-08-24");
    expect(body.data).not.toHaveProperty("passwordHash");
  });

  it("lists only the authenticated user's expenses", async () => {
    const alice = await signup("Alice", "alice-list@example.com");
    const bob = await signup("Bob", "bob-list@example.com");

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        amount: 100,
        currency: "INR",
        category: "food",
        note: "Alice expense",
        date: "2026-08-10",
      })
      .expect(201);

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({
        amount: 200,
        currency: "INR",
        category: "travel",
        note: "Bob expense",
        date: "2026-08-11",
      })
      .expect(201);

    const response = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const body = response.body as ExpenseListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.note).toBe("Alice expense");
    expect(body.data[0]?.userId).toBe(alice.user.id);
  });

  it("gets a single expense belonging to the authenticated user", async () => {
    const auth = await signup("Alice", "alice-get@example.com");

    const created = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 75,
        currency: "INR",
        category: "transport",
        note: "Taxi",
        date: "2026-08-12",
      })
      .expect(201);

    const expenseId = (created.body as ExpenseResponse).data.id;

    const response = await request(app)
      .get(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    expect((response.body as ExpenseResponse).data.id).toBe(expenseId);
  });

  it("updates an expense belonging to the authenticated user", async () => {
    const auth = await signup("Alice", "alice-update@example.com");

    const created = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 50,
        currency: "INR",
        category: "food",
        note: "Snack",
        date: "2026-08-13",
      })
      .expect(201);

    const expenseId = (created.body as ExpenseResponse).data.id;

    const response = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 80,
        currency: "INR",
        note: "Updated snack",
      })
      .expect(200);

    const body = response.body as ExpenseResponse;
    expect(body.data.amount).toBe(80);
    expect(body.data.note).toBe("Updated snack");
    expect(body.data.category).toBe("food");
  });

  it("deletes an expense belonging to the authenticated user", async () => {
    const auth = await signup("Alice", "alice-delete@example.com");

    const created = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 40,
        currency: "INR",
        category: "food",
        note: "Coffee",
        date: "2026-08-14",
      })
      .expect(201);

    const expenseId = (created.body as ExpenseResponse).data.id;

    await request(app)
      .delete(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(404);
  });

  it("searches expenses with empty filters", async () => {
    const auth = await signup("Alice", "alice-search-empty@example.com");

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 10,
        currency: "INR",
        category: "food",
        note: "A",
        date: "2026-08-01",
      })
      .expect(201);

    const response = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({})
      .expect(200);

    expect((response.body as ExpenseListResponse).data).toHaveLength(1);
  });

  it("filters expenses by category", async () => {
    const auth = await signup("Alice", "alice-search-category@example.com");

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 20,
        currency: "INR",
        category: "food",
        note: "Food",
        date: "2026-08-02",
      })
      .expect(201);

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 30,
        currency: "INR",
        category: "travel",
        note: "Travel",
        date: "2026-08-03",
      })
      .expect(201);

    const response = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ category: "food" })
      .expect(200);

    const body = response.body as ExpenseListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.category).toBe("food");
  });

  it("filters expenses by date range", async () => {
    const auth = await signup("Alice", "alice-search-dates@example.com");

    for (const [amount, date] of [
      [10, "2026-08-01"],
      [20, "2026-08-15"],
      [30, "2026-08-30"],
    ] as const) {
      await request(app)
        .post("/api/v1/expenses")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          amount,
          currency: "INR",
          category: "food",
          note: date,
          date,
        })
        .expect(201);
    }

    const response = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        from: "2026-08-10",
        to: "2026-08-20",
      })
      .expect(200);

    const body = response.body as ExpenseListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.date).toBe("2026-08-15");
  });

  it("filters expenses by category and date range together", async () => {
    const auth = await signup("Alice", "alice-search-combo@example.com");

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 10,
        currency: "INR",
        category: "food",
        note: "in range food",
        date: "2026-08-15",
      })
      .expect(201);

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 20,
        currency: "INR",
        category: "travel",
        note: "in range travel",
        date: "2026-08-16",
      })
      .expect(201);

    await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 30,
        currency: "INR",
        category: "food",
        note: "out of range food",
        date: "2026-07-01",
      })
      .expect(201);

    const response = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        category: "food",
        from: "2026-08-01",
        to: "2026-08-24",
      })
      .expect(200);

    const body = response.body as ExpenseListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.note).toBe("in range food");
  });

  it("stores amount and currency separately", async () => {
    const auth = await signup("Alice", "alice-currency@example.com");

    const response = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 10,
        currency: "USD",
        category: "food",
        note: "Dollar spend",
        date: "2026-08-24",
      })
      .expect(201);

    const body = response.body as ExpenseResponse;
    expect(body.data.amount).toBe(10);
    expect(body.data.currency).toBe("USD");
    expect(body.data.formattedAmount).toBe("10");
  });

  it("rejects unsupported currency codes", async () => {
    const auth = await signup("Alice", "alice-bad-currency@example.com");

    const response = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: 10,
        currency: "XYZ",
        category: "food",
        note: "bad currency",
        date: "2026-08-24",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects invalid create input", async () => {
    const auth = await signup("Alice", "alice-invalid@example.com");

    const response = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        amount: -5,
        currency: "INR",
        category: "",
        note: "bad",
        date: "not-a-date",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects invalid date range in search", async () => {
    const auth = await signup("Alice", "alice-invalid-range@example.com");

    const response = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        from: "2026-08-24",
        to: "2026-08-01",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects unauthorized expense access", async () => {
    await request(app).get("/api/v1/expenses").expect(401);
    await request(app)
      .post("/api/v1/expenses")
      .send({
        amount: 10,
        currency: "INR",
        category: "food",
        note: "x",
        date: "2026-08-01",
      })
      .expect(401);
  });

  it("prevents User B from reading, updating, or deleting User A's expense", async () => {
    const alice = await signup("Alice", "alice-isolation@example.com");
    const bob = await signup("Bob", "bob-isolation@example.com");

    const created = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        amount: 999,
        currency: "INR",
        category: "food",
        note: "Alice secret",
        date: "2026-08-20",
      })
      .expect(201);

    const expenseId = (created.body as ExpenseResponse).data.id;

    await request(app)
      .get(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ note: "hacked" })
      .expect(404);

    await request(app)
      .delete(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);

    const listResponse = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    expect((listResponse.body as ExpenseListResponse).data).toHaveLength(0);

    const searchResponse = await request(app)
      .post("/api/v1/expenses/search")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ category: "food" })
      .expect(200);

    expect((searchResponse.body as ExpenseListResponse).data).toHaveLength(0);

    await request(app)
      .get(`/api/v1/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
  });

  it("ignores client-supplied userId on create", async () => {
    const alice = await signup("Alice", "alice-userid@example.com");
    const bob = await signup("Bob", "bob-userid@example.com");

    const response = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        amount: 15,
        currency: "INR",
        category: "food",
        note: "owned by alice",
        date: "2026-08-21",
        userId: bob.user.id,
      })
      .expect(201);

    expect((response.body as ExpenseResponse).data.userId).toBe(alice.user.id);
  });

  it("rejects invalid expense ids", async () => {
    const auth = await signup("Alice", "alice-bad-id@example.com");

    await request(app)
      .get("/api/v1/expenses/not-an-object-id")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(400);
  });

  it("links expenses created from chat via createFromChat service", async () => {
    const auth = await signup("Alice", "alice-chat-expense@example.com");

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Food chat" })
      .expect(201);

    const threadId = (
      threadResponse.body as { success: true; data: { id: string } }
    ).data.id;

    const messageResponse = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ content: "Spent 500 on lunch" })
      .expect(201);

    const messageId = (
      messageResponse.body as { success: true; data: { id: string } }
    ).data.id;

    const { expenseService } = await import("../src/services/expense.service.js");
    const expense = await expenseService.createFromChat(
      auth.user.id,
      threadId,
      messageId,
      {
        amount: 500,
        currency: "INR",
        category: "food",
        note: "Lunch",
        date: "2026-08-24",
      },
    );

    expect(expense.sourceThreadId).toBe(threadId);
    expect(expense.sourceMessageId).toBe(messageId);

    const messages = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200);

    const items = (
      messages.body as {
        success: true;
        data: { items: Array<{ id: string; expenseIds: string[] }> };
      }
    ).data.items;

    expect(items[0]?.expenseIds).toContain(expense.id);
  });
});
