import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
process.env["GEMINI_API_KEY"] = "";
process.env["GEMINI_MODEL"] = "gemini-2.5-flash";

import type { LlmProvider } from "../src/ai/types.js";

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let graphRunnerService: typeof import("../src/ai/services/graph-runner.service.js").graphRunnerService;

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

describe("createExpenseTool + graph runner (Batch 3)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const graphModule = await import(
      "../src/ai/services/graph-runner.service.js"
    );

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    graphRunnerService = graphModule.graphRunnerService;

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

  it("persists an expense when the graph extracts a complete draft", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice-ai-expense@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;
    const userId = signup.body.data.user.id as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Lunch" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    const messageResponse = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Spent 450 on lunch today" })
      .expect(201);

    const messageId = messageResponse.body.data.id as string;

    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "create_expense" }),
        async () => ({
          expenseDraft: {
            amount: 450,
            category: "food",
            date: "2026-09-02",
            currency: "INR",
            note: "lunch",
          },
        }),
      ]),
    );

    const result = await graphRunnerService.run({
      userId,
      threadId,
      messageBatch: [{ id: messageId, content: "Spent 450 on lunch today" }],
    });

    expect(result.createdExpense).toBeDefined();
    expect(result.createdExpense?.amount).toBe(450);
    expect(result.createdExpense?.sourceMessageId).toBe(messageId);
    expect(result.assistantReply).toContain("Logged");

    const expenses = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(expenses.body.data).toHaveLength(1);
    expect(expenses.body.data[0].category).toBe("food");
    expect(expenses.body.data[0].amount).toBe(450);
  });

  it("rejects incomplete drafts in createExpenseTool", async () => {
    const { createExpenseTool } = await import(
      "../src/ai/tools/create-expense.tool.js"
    );

    await expect(
      createExpenseTool(
        {
          userId: "507f1f77bcf86cd799439012",
          threadId: "507f1f77bcf86cd799439011",
          messageId: "507f1f77bcf86cd799439013",
        },
        { category: "food" },
        "INR",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
