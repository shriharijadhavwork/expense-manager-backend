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
process.env["AI_PERSIST_EXECUTIONS"] = "true";

import type { LlmProvider } from "../src/ai/types.js";

let mongoServer: MongoMemoryServer;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let aiExecutionService: typeof import("../src/ai/services/ai-execution.service.js").aiExecutionService;
let graphRunnerService: typeof import("../src/ai/services/graph-runner.service.js").graphRunnerService;
let app: ReturnType<typeof import("../src/app.js").createApp>;

function createSequentialProvider(
  responses: Array<() => Promise<unknown>>,
): LlmProvider {
  let callIndex = 0;

  return {
    name: "mock",
    async generateStructured<T>(input: {
      schema: { parse: (value: unknown) => T };
      callSite?: string;
    }): Promise<T> {
      const handler = responses[callIndex];
      if (!handler) {
        throw new Error(`No mock response for LLM call ${callIndex}`);
      }
      callIndex += 1;
      const value = await handler();

      aiExecutionService.recordLlmCall({
        callSite: input.callSite ?? "unknown",
        model: "mock-model",
        provider: "mock",
        durationMs: 5,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        status: "success",
      });

      return input.schema.parse(value);
    },
  };
}

describe("AI observability (Batch 7)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const executionModule = await import(
      "../src/ai/services/ai-execution.service.js"
    );
    const graphModule = await import(
      "../src/ai/services/graph-runner.service.js"
    );

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    aiExecutionService = executionModule.aiExecutionService;
    graphRunnerService = graphModule.graphRunnerService;
    app = appModule.createApp();

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

  it("records node and tool spans during runTracked", async () => {
    await aiExecutionService.runTracked(
      {
        userId: "507f1f77bcf86cd799439011",
        threadId: "507f1f77bcf86cd799439012",
        messageIds: ["507f1f77bcf86cd799439013"],
        trigger: "api_run",
      },
      async () => {
        await aiExecutionService.withNodeSpan("test_node", async () => "ok");
        await aiExecutionService.withToolSpan("test_tool", async () => "done");
        aiExecutionService.recordLlmCall({
          callSite: "classify_intent",
          model: "mock-model",
          provider: "mock",
          durationMs: 12,
          promptTokens: 20,
          completionTokens: 8,
          totalTokens: 28,
          status: "success",
        });
        return "result";
      },
    );

    const { AiExecution } = await import("../src/models/ai-execution.model.js");
    const records = await AiExecution.find().exec();

    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("success");
    expect(records[0]?.nodeSpans).toEqual([
      expect.objectContaining({ node: "test_node", status: "success" }),
    ]);
    expect(records[0]?.toolCalls).toEqual([
      expect.objectContaining({ tool: "test_tool", status: "success" }),
    ]);
    expect(records[0]?.llmCalls).toEqual([
      expect.objectContaining({
        callSite: "classify_intent",
        totalTokens: 28,
        status: "success",
      }),
    ]);
    expect(records[0]?.totalTokens).toBe(28);
    expect(records[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("persists graph execution with intent and node spans", async () => {
    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "general_chat" }),
        async () => ({
          reply: "Hello! I'm FLUX — happy to help track your spending.",
        }),
      ]),
    );

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Observer",
        email: "observer@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;
    const userId = signup.body.data.user.id as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Observe" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    await graphRunnerService.run({
      userId,
      threadId,
      messageBatch: [
        {
          id: new mongoose.Types.ObjectId().toString(),
          content: "Hello FLUX",
        },
      ],
      trigger: "api_run",
    });

    const { AiExecution } = await import("../src/models/ai-execution.model.js");
    const record = await AiExecution.findOne({ threadId }).exec();

    expect(record).toBeTruthy();
    expect(record?.status).toBe("success");
    expect(record?.intent).toBe("general_chat");
    expect(record?.trigger).toBe("api_run");
    expect(record?.nodeSpans.map((span) => span.node)).toEqual(
      expect.arrayContaining([
        "load_context",
        "classify_intent",
        "build_reply",
      ]),
    );
    expect(record?.llmCalls).toHaveLength(2);
    expect(record?.llmCalls[0]?.callSite).toBe("classify_intent");
    expect(record?.llmCalls[1]?.callSite).toBe("build_reply");
  });

  it("lists executions for a thread via API", async () => {
    graphRunnerService.setProvider(
      createSequentialProvider([
        async () => ({ intent: "general_chat" }),
        async () => ({
          reply: "Hello! I'm FLUX — happy to help track your spending.",
        }),
      ]),
    );

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Lister",
        email: "lister@example.com",
        password: "password123",
      })
      .expect(201);

    const token = signup.body.data.token as string;
    const userId = signup.body.data.user.id as string;

    const threadResponse = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "List" })
      .expect(201);

    const threadId = threadResponse.body.data.id as string;

    await graphRunnerService.run({
      userId,
      threadId,
      messageBatch: [
        {
          id: new mongoose.Types.ObjectId().toString(),
          content: "Track this",
        },
      ],
      trigger: "api_run",
    });

    const response = await request(app)
      .get(`/api/v1/ai/executions?threadId=${threadId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].threadId).toBe(threadId);
    expect(response.body.data[0].status).toBe("success");
    expect(response.body.data[0].intent).toBe("general_chat");
  });

  it("records failed execution when tracked work throws", async () => {
    await expect(
      aiExecutionService.runTracked(
        {
          userId: "507f1f77bcf86cd799439011",
          threadId: "507f1f77bcf86cd799439012",
          messageIds: ["507f1f77bcf86cd799439013"],
          trigger: "orchestrator",
        },
        async () => {
          throw new Error("graph exploded");
        },
      ),
    ).rejects.toThrow("graph exploded");

    const { AiExecution } = await import("../src/models/ai-execution.model.js");
    const record = await AiExecution.findOne({
      trigger: "orchestrator",
    }).exec();

    expect(record?.status).toBe("failed");
    expect(record?.error?.message).toBe("graph exploded");
    expect(record?.error?.phase).toBe("graph");
  });
});
