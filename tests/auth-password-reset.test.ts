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

function extractResetToken(text: string): string {
  const match = text.match(/reset-password\?token=([a-f0-9]+)/i);
  if (!match?.[1]) {
    throw new Error(`Reset token not found in email text: ${text}`);
  }
  return match[1];
}

async function signupVerified(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  const provider = createRecordingProvider();
  emailService.setProvider(provider);

  const signup = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name, email, password })
    .expect(201);

  const token = (
    signup.body as { data: { token: string } }
  ).data.token;

  const otpMatch = provider.messages[0]?.text.match(
    /confirmation code is:\s*(\d{6})/i,
  );
  if (!otpMatch?.[1]) {
    throw new Error("OTP missing after signup");
  }

  await request(app)
    .post("/api/v1/auth/verify-email")
    .set("Authorization", `Bearer ${token}`)
    .send({ code: otpMatch[1] })
    .expect(200);

  emailService.setProvider(null);
}

describe("Auth password reset (Batch E3)", () => {
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

  it("returns a generic success for unknown emails", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" })
      .expect(200);

    expect((response.body as { data: { message: string } }).data.message).toMatch(
      /If an account exists/i,
    );
    expect(provider.messages).toHaveLength(0);
  });

  it("emails a reset link and allows a single password change", async () => {
    await signupVerified("Dana", "dana-reset@example.com", "password123");

    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "dana-reset@example.com" })
      .expect(200);

    expect((forgot.body as { data: { message: string } }).data.message).toMatch(
      /If an account exists/i,
    );
    expect(provider.messages).toHaveLength(1);

    const resetToken = extractResetToken(provider.messages[0]!.text);

    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, newPassword: "newpassword99" })
      .expect(200);

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dana-reset@example.com", password: "password123" })
      .expect(401);

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dana-reset@example.com", password: "newpassword99" })
      .expect(200);

    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, newPassword: "anotherpass88" })
      .expect(400);
  });

  it("rejects expired reset tokens", async () => {
    await signupVerified("Eve", "eve-reset@example.com", "password123");

    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "eve-reset@example.com" })
      .expect(200);

    const resetToken = extractResetToken(provider.messages[0]!.text);

    const { User } = await import("../src/models/user.model.js");
    await User.updateOne(
      { email: "eve-reset@example.com" },
      { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } },
    ).exec();

    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, newPassword: "newpassword99" })
      .expect(400);
  });
});
