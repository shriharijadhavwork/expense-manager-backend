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

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let aiDebounceService: typeof import("../src/ai/services/debounce.service.js").aiDebounceService;
let graphRunnerService: typeof import("../src/ai/services/graph-runner.service.js").graphRunnerService;
let conversationAiStateService: typeof import("../src/ai/services/conversation-ai-state.service.js").conversationAiStateService;

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

describe("conversation AI state (Batch 5)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const debounceModule = await import("../src/ai/services/debounce.service.js");
    const graphModule = await import(
      "../src/ai/services/graph-runner.service.js"
    );
    const stateModule = await import(
      "../src/ai/services/conversation-ai-state.service.js"
    );

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    aiDebounceService = debounceModule.aiDebounceService;
    graphRunnerService = graphModule.graphRunnerService;
    conversationAiStateService = stateModule.conversationAiStateService;

    await connectDatabase();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    aiDebounceService.clearAll();
    graphRunnerService.setProvider(null);

    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    aiDebounceService.clearAll();
    graphRunnerService.setProvider(null);
    vi.useRealTimers();
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("creates conversation AI state for a thread", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice-ai-state@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;
    const token = signup.body.data.token as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "State" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;
    const state = await conversationAiStateService.getOrCreate(threadId, userId);

    expect(state.threadId).toBe(threadId);
    expect(state.userId).toBe(userId);
    expect(state.version).toBe(0);
    expect(state.lastProcessedMessageId).toBeUndefined();
  });

  it("persists an incomplete expense draft across turns", async () => {
    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "create_expense" }),
        async () => ({
          expenseDraft: { category: "food" },
          missingFields: ["amount"],
        }),
        async () => ({
          reply: "Roughly how much was lunch?",
        }),
        async () => ({ intent: "create_expense" }),
        async () => ({
          expenseDraft: {
            amount: 450,
            date: "2026-09-02",
            currency: "INR",
          },
        }),
        async () => ({
          reply: "Perfect — I've saved that ₹450 food expense for you.",
        }),
      ]),
    );

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Bob",
        email: "bob-ai-state@example.com",
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

    const firstMessage = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Lunch was expensive" })
      .expect(201);

    await aiDebounceService.flush(threadId);

    const afterFirst = await conversationAiStateService.getOrCreate(
      threadId,
      userId,
    );

    expect(afterFirst.expenseDraft?.category).toBe("food");
    expect(afterFirst.missingRequiredFields).toContain("amount");
    expect(afterFirst.lastProcessedMessageId).toBe(firstMessage.body.data.id);
    expect(afterFirst.version).toBe(1);

    const secondMessage = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "450 rupees" })
      .expect(201);

    await aiDebounceService.flush(threadId);

    const afterSecond = await conversationAiStateService.getOrCreate(
      threadId,
      userId,
    );

    expect(afterSecond.lastProcessedMessageId).toBe(secondMessage.body.data.id);
    expect(afterSecond.version).toBe(2);
    expect(afterSecond.expenseDraft).toBeUndefined();

    const expenses = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(expenses.body.data).toHaveLength(1);
    expect(expenses.body.data[0].amount).toBe(450);
    expect(expenses.body.data[0].sourceMessageId).toBe(secondMessage.body.data.id);
  });

  it("loads unprocessed messages from the database using lastProcessedMessageId", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Carol",
        email: "carol-ai-state@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;
    const token = signup.body.data.token as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Batch" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    const first = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "first" })
      .expect(201);

    await conversationAiStateService.recordSuccessfulTurn({
      threadId,
      userId,
      aiState: await conversationAiStateService.getOrCreate(threadId, userId),
      messageBatch: [{ id: first.body.data.id, content: "first" }],
      result: {
        intent: "general_chat",
        missingFields: [],
        defaultCurrency: "INR",
      },
    });

    const second = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "second" })
      .expect(201);

    const batch = await conversationAiStateService.resolveMessageBatch({
      threadId,
      userId,
      debouncedMessages: [],
      lastProcessedMessageId: first.body.data.id,
    });

    expect(batch).toEqual([
      { id: second.body.data.id, content: "second" },
    ]);
  });

  it("does not advance the watermark past an unhandled expense message", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Dana",
        email: "dana-ai-watermark@example.com",
        password: "password123",
      })
      .expect(201);

    const userId = signup.body.data.user.id as string;
    const token = signup.body.data.token as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Watermark" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    const anchorMessage = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "hello flux" })
      .expect(201);

    await conversationAiStateService.recordSuccessfulTurn({
      threadId,
      userId,
      aiState: await conversationAiStateService.getOrCreate(threadId, userId),
      messageBatch: [{ id: anchorMessage.body.data.id, content: "hello flux" }],
      result: {
        intent: "general_chat",
        missingFields: [],
        defaultCurrency: "INR",
      },
    });

    const aiState = await conversationAiStateService.getOrCreate(threadId, userId);

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

    const updated = await conversationAiStateService.recordSuccessfulTurn({
      threadId,
      userId,
      aiState,
      messageBatch: [
        {
          id: lunchMessage.body.data.id,
          content: "i spent 120 for lunch share",
        },
        {
          id: rapidoMessage.body.data.id,
          content: "i spent 30 for rapido today",
        },
      ],
      result: {
        intent: "create_expense",
        missingFields: [],
        defaultCurrency: "INR",
        extractedExpenses: [
          {
            draft: {
              amount: 30,
              category: "transportation",
              note: "rapido",
              date: "2026-09-02",
              currency: "INR",
            },
            sourceMessageId: rapidoMessage.body.data.id,
            missingFields: [],
          },
        ],
        createdExpenses: [
          {
            id: "created-rapido",
            sourceMessageId: rapidoMessage.body.data.id,
            amount: 30,
            category: "transportation",
            note: "rapido",
          },
        ],
      },
    });

    expect(updated).not.toBeNull();

    const afterPartial = await conversationAiStateService.getOrCreate(
      threadId,
      userId,
    );

    expect(afterPartial.lastProcessedMessageId).toBe(anchorMessage.body.data.id);

    const retryBatch = await conversationAiStateService.resolveMessageBatch({
      threadId,
      userId,
      debouncedMessages: [],
      lastProcessedMessageId: afterPartial.lastProcessedMessageId,
    });

    expect(retryBatch.map((message) => message.id)).toEqual([
      lunchMessage.body.data.id,
      rapidoMessage.body.data.id,
    ]);
  });
});
