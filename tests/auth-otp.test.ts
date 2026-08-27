import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import {
  afterAll,
  afterEach,
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

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;
let emailService: typeof import("../src/services/email/email.service.js").emailService;

type AuthResponse = {
  success: true;
  data: {
    user: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
    };
    token: string;
  };
};

type MailMessage = {
  to: unknown;
  subject: string;
  text: string;
};

function createRecordingProvider() {
  const messages: MailMessage[] = [];
  return {
    name: "console" as const,
    messages,
    async send(message: MailMessage) {
      messages.push(message);
    },
  };
}

function extractOtp(text: string): string {
  const match = text.match(/confirmation code is:\s*(\d{6})/i);
  if (!match?.[1]) {
    throw new Error(`OTP not found in email text: ${text}`);
  }
  return match[1];
}

describe("Auth email verification (Batch E2)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env["MONGODB_URI"] = mongoServer.getUri("expense-manager-test");

    const databaseModule = await import("../src/config/database.js");
    const appModule = await import("../src/app.js");
    const emailModule = await import("../src/services/email/email.service.js");

    connectDatabase = databaseModule.connectDatabase;
    disconnectDatabase = databaseModule.disconnectDatabase;
    app = appModule.createApp();
    emailService = emailModule.emailService;

    await connectDatabase();
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterEach(() => {
    emailService.setProvider(null);
    emailService.resetDefaultProvider();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("signs up unverified, emails an OTP, and verifies it", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Alice",
        email: "alice-otp@example.com",
        password: "password123",
      })
      .expect(201);

    const body = signup.body as AuthResponse;
    expect(body.data.user.emailVerified).toBe(false);
    expect(provider.messages).toHaveLength(1);

    const code = extractOtp(provider.messages[0]!.text);
    const token = body.data.token;

    const verified = await request(app)
      .post("/api/v1/auth/verify-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ code })
      .expect(200);

    expect((verified.body as { data: { emailVerified: boolean } }).data.emailVerified).toBe(
      true,
    );

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect((me.body as { data: { emailVerified: boolean } }).data.emailVerified).toBe(
      true,
    );
  });

  it("rejects invalid OTP and allows resend then verify", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Bob",
        email: "bob-otp@example.com",
        password: "password123",
      })
      .expect(201);

    const token = (signup.body as AuthResponse).data.token;

    await request(app)
      .post("/api/v1/auth/verify-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" })
      .expect(400);

    // Cooldown is 60s — force by clearing lastSentAt via second provider message after waiting is hard in unit tests.
    // Use repository to age lastSentAt.
    const { User } = await import("../src/models/user.model.js");
    await User.updateOne(
      { email: "bob-otp@example.com" },
      {
        $set: {
          emailOtpLastSentAt: new Date(Date.now() - 61_000),
        },
      },
    ).exec();

    await request(app)
      .post("/api/v1/auth/resend-otp")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(provider.messages.length).toBeGreaterThanOrEqual(2);
    const latest = provider.messages[provider.messages.length - 1]!;
    const code = extractOtp(latest.text);

    await request(app)
      .post("/api/v1/auth/verify-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ code })
      .expect(200);
  });

  it("enforces resend cooldown", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        name: "Carol",
        email: "carol-otp@example.com",
        password: "password123",
      })
      .expect(201);

    const token = (signup.body as AuthResponse).data.token;

    await request(app)
      .post("/api/v1/auth/resend-otp")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});
