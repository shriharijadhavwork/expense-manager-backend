import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
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
import type { RealtimeEvent } from "../src/realtime/types.js";

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let aiDebounceService: typeof import("../src/ai/services/debounce.service.js").aiDebounceService;
let graphRunnerService: typeof import("../src/ai/services/graph-runner.service.js").graphRunnerService;
let realtimePublisher: typeof import("../src/realtime/index.js").realtimePublisher;

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

describe("AI chat orchestration (Batch 4)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const debounceModule = await import("../src/ai/services/debounce.service.js");
    const graphModule = await import(
      "../src/ai/services/graph-runner.service.js"
    );
    const realtimeModule = await import("../src/realtime/index.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    aiDebounceService = debounceModule.aiDebounceService;
    graphRunnerService = graphModule.graphRunnerService;
    realtimePublisher = realtimeModule.realtimePublisher;

    await connectDatabase();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    aiDebounceService.clearAll();
    graphRunnerService.setProvider(null);
    realtimePublisher.clear();

    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    aiDebounceService.clearAll();
    graphRunnerService.setProvider(null);
    realtimePublisher.clear();
    vi.useRealTimers();
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("persists and publishes an assistant reply after debounce", async () => {
    const received: RealtimeEvent[] = [];
    realtimePublisher.register({
      name: "test-recorder",
      publish(event) {
        received.push(event);
      },
    });

    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "general_chat" }),
        async () => ({
          reply: "Hi there! I'm FLUX — ready when you want to log a spend.",
        }),
      ]),
    );

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice-ai-chat@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Chat" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Hello FLUX" })
      .expect(201);

    expect(received).toHaveLength(1);
    expect(received[0]?.message.role).toBe("user");

    await aiDebounceService.flush(threadId);

    const messages = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(messages.body.data.items).toHaveLength(2);
    expect(messages.body.data.items[1].role).toBe("assistant");
    expect(messages.body.data.items[1].content).toContain("ready when you want");

    const assistantEvents = received.filter(
      (event) => event.message.role === "assistant",
    );
    expect(assistantEvents).toHaveLength(1);
    expect(assistantEvents[0]?.threadId).toBe(threadId);
  });

  it("creates an expense and assistant message from a debounced batch", async () => {
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
        async () => ({
          reply: "Done — I've logged your ₹450 lunch for today.",
        }),
      ]),
    );

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Bob",
        email: "bob-ai-chat@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;

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

    await aiDebounceService.flush(threadId);

    const messages = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const assistant = messages.body.data.items.find(
      (item: { role: string }) => item.role === "assistant",
    );

    expect(assistant.content).toContain("logged your ₹450 lunch");
    expect(assistant.expenseIds).toHaveLength(1);

    const expenses = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(expenses.body.data).toHaveLength(1);
    expect(expenses.body.data[0].amount).toBe(450);
    expect(expenses.body.data[0].sourceMessageId).toBe(messageId);
  });

  it("links multiple expense ids on the assistant message", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Cara",
        email: "cara-ai-multi-chat@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Batch" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    const lunchMessage = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "i spent 120 for lunch share" })
      .expect(201);

    const rapidoMessage = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "i spent 30 for rapido today" })
      .expect(201);

    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "create_expense" }),
        async () => ({
          expenses: [
            {
              sourceMessageId: lunchMessage.body.data.id,
              amount: 120,
              category: "food",
              note: "lunch share",
              dateHint: "today",
            },
            {
              sourceMessageId: rapidoMessage.body.data.id,
              amount: 30,
              category: "transportation",
              note: "rapido",
              dateHint: "today",
            },
          ],
        }),
      ]),
    );

    await aiDebounceService.flush(threadId);

    const messages = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const assistant = messages.body.data.items.find(
      (item: { role: string }) => item.role === "assistant",
    );

    expect(assistant.expenseIds).toHaveLength(2);

    const expenses = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(expenses.body.data).toHaveLength(2);
  });
});
