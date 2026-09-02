import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
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
process.env["EMAIL_PROVIDER"] = "console";
process.env["EMAIL_FROM"] = "Flux Team <noreply@localhost>";
process.env["GEMINI_API_KEY"] = "test-key";
process.env["GEMINI_MODEL"] = "gemini-2.5-flash";

import type { LlmProvider } from "../src/ai/types.js";

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let graphRunnerService: typeof import("../src/ai/services/graph-runner.service.js").graphRunnerService;
let expenseService: typeof import("../src/services/expense.service.js").expenseService;

function createSequentialProvider(
  responses: Array<() => Promise<unknown>>,
): LlmProvider {
  let callIndex = 0;

  return {
    name: "mock",
    async generateStructured<T>(input: {
      schema: { parse: (value: unknown) => T };
    }): Promise<T> {
      const handler = responses[callIndex];
      if (!handler) {
        throw new Error(`No mock response for LLM call ${callIndex}`);
      }
      callIndex += 1;
      const value = await handler();
      return input.schema.parse(value);
    },
  };
}

describe("financial AI capabilities (Batch 6)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const graphModule = await import(
      "../src/ai/services/graph-runner.service.js"
    );
    const expenseModule = await import("../src/services/expense.service.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    graphRunnerService = graphModule.graphRunnerService;
    expenseService = expenseModule.expenseService;

    await connectDatabase();
  });

  beforeEach(async () => {
    graphRunnerService.setProvider(null);

    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    graphRunnerService.setProvider(null);
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("summarizes spending for query_expenses intent", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice-query@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;

    await expenseService.create(userId, {
      amount: 300,
      currency: "INR",
      category: "food",
      note: "Lunch",
      date: "2026-09-01",
    });
    await expenseService.create(userId, {
      amount: 200,
      currency: "INR",
      category: "food",
      note: "Snacks",
      date: "2026-09-02",
    });

    const token = signup.body.data.token as string;
    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Query" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "query_expenses" }),
        async () => ({
          category: "food",
          from: "2026-09-01",
          to: "2026-09-02",
          mode: "summary",
        }),
      ]),
    );

    const result = await graphRunnerService.run({
      userId,
      threadId,
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439013",
          content: "How much did I spend on food this month?",
        },
      ],
    });

    expect(result.intent).toBe("query_expenses");
    expect(result.assistantReply).toContain("500");
    expect(result.assistantReply).toContain("food");
  });

  it("updates an expense for update_expense intent", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Bob",
        email: "bob-update@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;

    const created = await expenseService.create(userId, {
      amount: 300,
      currency: "INR",
      category: "food",
      note: "Lunch",
      date: "2026-09-01",
    });

    const token = signup.body.data.token as string;
    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Update" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "update_expense" }),
        async () => ({
          expenseId: created.id,
          updates: { amount: 350 },
        }),
      ]),
    );

    const result = await graphRunnerService.run({
      userId,
      threadId,
      messageBatch: [
        {
          id: "507f1f77bcf86cd799439014",
          content: "Change that lunch expense to 350",
        },
      ],
    });

    expect(result.intent).toBe("update_expense");
    expect(result.assistantReply).toContain("Updated");

    const updated = await expenseService.getById(userId, created.id);
    expect(updated.amount).toBe(350);
  });

  it("computes spending summary totals by category", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Carol",
        email: "carol-summary@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;

    await expenseService.create(userId, {
      amount: 100,
      currency: "INR",
      category: "food",
      note: "Breakfast",
      date: "2026-09-01",
    });
    await expenseService.create(userId, {
      amount: 50,
      currency: "INR",
      category: "travel",
      note: "Cab",
      date: "2026-09-01",
    });

    const summary = await expenseService.getSpendingSummary(userId, {
      from: "2026-09-01",
      to: "2026-09-01",
    });

    expect(summary.count).toBe(2);
    expect(summary.totals[0]?.amount).toBe(150);
    expect(summary.byCategory).toHaveLength(2);
  });
});
