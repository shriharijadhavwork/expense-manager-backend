import { MongoMemoryServer } from "mongodb-memory-server";
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
process.env["ERROR_LOG_PERSIST"] = "true";

describe("error log service (Batch 1)", () => {
  let mongoServer: MongoMemoryServer;
  let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
  let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
  let errorLogService: typeof import("../src/services/error-log.service.js").errorLogService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const errorLogModule = await import("../src/services/error-log.service.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    errorLogService = errorLogModule.errorLogService;

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

  it("persists structured error events with context", async () => {
    const record = await errorLogService.recordAsync({
      source: "ai_llm",
      userId: "507f1f77bcf86cd799439011",
      threadId: "507f1f77bcf86cd799439012",
      messageId: "507f1f77bcf86cd799439013",
      executionId: "exec-123",
      model: "gemini-3.6-flash",
      callSite: "classify_intent",
      requestPayload: {
        callSite: "classify_intent",
        apiKey: "secret-should-redact",
      },
      error: new Error("[503 Service Unavailable] high demand"),
    });

    expect(record).toBeTruthy();
    expect(record?.source).toBe("ai_llm");
    expect(record?.errorCode).toBe("MODEL_OVERLOADED");
    expect(record?.httpStatus).toBe(503);
    expect(record?.requestPayload?.["apiKey"]).toBe("[redacted]");
    expect(record?.errorPayload["message"]).toContain("503");
  });
});
