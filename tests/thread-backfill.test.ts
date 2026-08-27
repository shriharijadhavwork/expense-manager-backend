import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let Thread: typeof import("../src/models/thread.model.js").Thread;
let backfillThreadModelBatch4: typeof import("../src/migrations/backfill-thread-model.js").backfillThreadModelBatch4;

describe("Thread model backfill (Batch 4)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const threadModelModule = await import("../src/models/thread.model.js");
    const migrationModule = await import(
      "../src/migrations/backfill-thread-model.js"
    );

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    Thread = threadModelModule.Thread;
    backfillThreadModelBatch4 = migrationModule.backfillThreadModelBatch4;

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

  it("backfills legacy personal threads with type/createdBy/dayKey/sequence", async () => {
    const userId = new mongoose.Types.ObjectId();
    const createdAt = new Date("2026-08-26T08:00:00.000Z");

    await mongoose.connection.collection("threads").insertMany([
      {
        userId,
        title: "Legacy one",
        status: "active",
        deletedAt: null,
        lastActivityAt: createdAt,
        readAt: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        userId,
        title: "Legacy two",
        status: "active",
        deletedAt: null,
        lastActivityAt: new Date("2026-08-26T09:00:00.000Z"),
        readAt: null,
        createdAt: new Date("2026-08-26T09:00:00.000Z"),
        updatedAt: new Date("2026-08-26T09:00:00.000Z"),
      },
    ]);

    const updated = await backfillThreadModelBatch4();
    expect(updated).toBe(2);

    const threads = await Thread.find({ userId }).sort({ sequence: 1 }).exec();
    expect(threads).toHaveLength(2);
    expect(threads[0]?.type).toBe("personal");
    expect(threads[0]?.createdBy?.toString()).toBe(String(userId));
    expect(threads[0]?.groupId).toBeNull();
    expect(threads[0]?.dayKey).toBe("2026-08-26");
    expect(threads[0]?.sequence).toBe(1);
    expect(threads[1]?.sequence).toBe(2);
    expect(threads[0]?.title).toBe("Legacy one");
  });
});
