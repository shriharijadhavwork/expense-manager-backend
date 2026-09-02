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
process.env["EMAIL_PROVIDER"] = "console";
process.env["EMAIL_FROM"] = "Flux Team <noreply@localhost>";
process.env["GEMINI_API_KEY"] = "";
process.env["GEMINI_MODEL"] = "gemini-2.5-flash";

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let aiService: typeof import("../src/ai/services/ai.service.js").aiService;

async function signupAndGetToken(): Promise<string> {
  const response = await request(app)
    .post("/api/v1/auth/signup")
    .send({
      name: "Alice",
      email: "alice@example.com",
      password: "password123",
    })
    .expect(201);

  return response.body.data.token as string;
}

describe("AI health API (Batch 1)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const aiModule = await import("../src/ai/services/ai.service.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    aiService = aiModule.aiService;

    await connectDatabase();
  });

  beforeEach(async () => {
    aiService.setProvider(null);
    aiService.resetDefaultProvider();

    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    aiService.setProvider(null);
    aiService.resetDefaultProvider();
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("requires authentication", async () => {
    await request(app).get("/api/v1/ai/health").expect(401);
  });

  it("returns AI status for authenticated users", async () => {
    const token = await signupAndGetToken();

    const response = await request(app)
      .get("/api/v1/ai/health")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        configured: false,
        provider: null,
        model: "gemini-2.5-flash",
        debounceMs: 1500,
      },
    });
  });

  it("pings the injected provider when ?ping=true", async () => {
    const token = await signupAndGetToken();

    aiService.setProvider({
      name: "mock",
      async generateStructured() {
        return { status: "ok" as const };
      },
    });

    const response = await request(app)
      .get("/api/v1/ai/health?ping=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.configured).toBe(true);
    expect(response.body.data.provider).toBe("mock");
    expect(response.body.data.ping.ok).toBe(true);
    expect(response.body.data.ping.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
