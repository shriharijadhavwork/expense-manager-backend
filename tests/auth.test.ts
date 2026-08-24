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
    user: {
      id: string;
      name: string;
      email: string;
      preferences: {
        theme: string;
        timezone: string;
        defaultCurrency: string;
      };
    };
    token: string;
  };
};

type MeResponse = {
  success: true;
  data: AuthResponse["data"]["user"];
};

type PreferencesResponse = {
  success: true;
  data: AuthResponse["data"]["user"]["preferences"];
};

describe("Auth preferences API", () => {
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

  it("creates default preferences on signup", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice@example.com",
        password: "password123",
      })
      .expect(201);

    const body = response.body as AuthResponse;
    expect(body.data.user.preferences).toEqual({
      theme: "system",
      timezone: "auto",
      defaultCurrency: "INR",
    });
  });

  it("returns preferences on GET /auth/me", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Bob",
        email: "bob@example.com",
        password: "password123",
      })
      .expect(201);

    const token = (signup.body as AuthResponse).data.token;

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const body = response.body as MeResponse;
    expect(body.data.preferences.defaultCurrency).toBe("INR");
  });

  it("updates preferences on PATCH /auth/me", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Carol",
        email: "carol@example.com",
        password: "password123",
      })
      .expect(201);

    const token = (signup.body as AuthResponse).data.token;

    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        preferences: {
          theme: "dark",
          timezone: "Asia/Kolkata",
          defaultCurrency: "USD",
        },
      })
      .expect(200);

    const body = response.body as PreferencesResponse;
    expect(body.data).toEqual({
      theme: "dark",
      timezone: "Asia/Kolkata",
      defaultCurrency: "USD",
    });

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect((me.body as MeResponse).data.preferences.defaultCurrency).toBe("USD");
  });

  it("rejects invalid preference updates", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Dan",
        email: "dan@example.com",
        password: "password123",
      })
      .expect(201);

    const token = (signup.body as AuthResponse).data.token;

    await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        preferences: {
          defaultCurrency: "XYZ",
        },
      })
      .expect(400);
  });
});
