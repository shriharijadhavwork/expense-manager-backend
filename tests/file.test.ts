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

const cloudinaryMock = vi.hoisted(() => ({
  uploadFile: vi.fn(
    async ({
      buffer,
      userId,
    }: {
      buffer: Buffer;
      userId: string;
      kind: string;
    }) => ({
      url: `https://res.cloudinary.com/test/image/upload/v1/expense-manager/${userId}/mock-file.jpg`,
      publicId: `expense-manager/${userId}/mock-file`,
      bytes: buffer.length,
    }),
  ),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/storage/cloudinary-storage.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/services/storage/cloudinary-storage.service.js")
    >();

  return {
    ...actual,
    cloudinaryStorageService: cloudinaryMock,
  };
});

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let connectDatabase: typeof import("../src/config/database.js").connectDatabase;
let disconnectDatabase: typeof import("../src/config/database.js").disconnectDatabase;

type AuthResponse = {
  success: true;
  data: {
    user: { id: string; name: string; email: string };
    token: string;
  };
};

type FileResponse = {
  success: true;
  data: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    kind: "image" | "pdf" | "doc";
    url: string;
    thumbnailUrl?: string;
    createdAt: string;
  };
};

type ThreadResponse = {
  success: true;
  data: {
    id: string;
  };
};

type MessageResponse = {
  success: true;
  data: {
    attachmentIds: string[];
  };
};

type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

async function signup(
  name: string,
  email: string,
  password = "password123",
): Promise<AuthResponse["data"]> {
  const response = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name, email, password })
    .expect(201);

  return (response.body as AuthResponse).data;
}

async function uploadFile(
  token: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<FileResponse["data"]> {
  const response = await request(app)
    .post("/api/v1/files/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, {
      filename: fileName,
      contentType: mimeType,
    })
    .expect(201);

  return (response.body as FileResponse).data;
}

describe("File API", () => {
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
    cloudinaryMock.uploadFile.mockClear();
    cloudinaryMock.deleteFile.mockClear();

    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("uploads an allowed image to Cloudinary and returns metadata with url", async () => {
    const auth = await signup("Alice", "alice-file@example.com");

    const file = await uploadFile(
      auth.token,
      "receipt.jpg",
      JPEG_BYTES,
      "image/jpeg",
    );

    expect(file.name).toBe("receipt.jpg");
    expect(file.mimeType).toBe("image/jpeg");
    expect(file.size).toBe(JPEG_BYTES.length);
    expect(file.kind).toBe("image");
    expect(file.id).toMatch(/^[a-f\d]{24}$/i);
    expect(file.createdAt).toBeTruthy();
    expect(file.url).toContain("res.cloudinary.com");
    expect(file.thumbnailUrl).toContain("res.cloudinary.com");
    expect(file).not.toHaveProperty("publicId");
    expect(cloudinaryMock.uploadFile).toHaveBeenCalledOnce();
  });

  it("rejects unsupported file types", async () => {
    const auth = await signup("Alice", "alice-gif@example.com");

    const response = await request(app)
      .post("/api/v1/files/upload")
      .set("Authorization", `Bearer ${auth.token}`)
      .attach("file", Buffer.from("GIF89a"), {
        filename: "fun.gif",
        contentType: "image/gif",
      })
      .expect(400);

    expect((response.body as ErrorResponse).error.message).toContain("GIF");
  });

  it("rejects uploads without a file", async () => {
    const auth = await signup("Alice", "alice-no-file@example.com");

    const response = await request(app)
      .post("/api/v1/files/upload")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(400);

    expect((response.body as ErrorResponse).error.message).toBe(
      "No file uploaded",
    );
  });

  it("requires authentication", async () => {
    await request(app)
      .post("/api/v1/files/upload")
      .attach("file", JPEG_BYTES, {
        filename: "receipt.jpg",
        contentType: "image/jpeg",
      })
      .expect(401);
  });

  it("returns metadata for the owner and blocks other users", async () => {
    const alice = await signup("Alice", "alice-file-owner@example.com");
    const bob = await signup("Bob", "bob-file-owner@example.com");
    const file = await uploadFile(
      alice.token,
      "receipt.jpg",
      JPEG_BYTES,
      "image/jpeg",
    );

    const metadata = await request(app)
      .get(`/api/v1/files/${file.id}`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    const body = metadata.body as FileResponse;
    expect(body.data.id).toBe(file.id);
    expect(body.data.url).toBe(file.url);

    await request(app)
      .get(`/api/v1/files/${file.id}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(404);
  });

  it("links uploaded files to message attachmentIds", async () => {
    const auth = await signup("Alice", "alice-msg-file@example.com");
    const thread = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ title: "Receipt chat" })
      .expect(201);

    const threadId = (thread.body as ThreadResponse).data.id;
    const file = await uploadFile(
      auth.token,
      "receipt.jpg",
      JPEG_BYTES,
      "image/jpeg",
    );

    const response = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        content: "Here is the receipt",
        attachmentIds: [file.id],
      })
      .expect(201);

    expect((response.body as MessageResponse).data.attachmentIds).toEqual([
      file.id,
    ]);
  });

  it("rejects message attachmentIds that do not belong to the user", async () => {
    const alice = await signup("Alice", "alice-att-owner@example.com");
    const bob = await signup("Bob", "bob-att-owner@example.com");
    const aliceThread = await request(app)
      .post("/api/v1/threads")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({})
      .expect(201);
    const bobFile = await uploadFile(
      bob.token,
      "receipt.jpg",
      JPEG_BYTES,
      "image/jpeg",
    );

    const response = await request(app)
      .post(
        `/api/v1/threads/${(aliceThread.body as ThreadResponse).data.id}/messages`,
      )
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        content: "Using someone else's file",
        attachmentIds: [bobFile.id],
      })
      .expect(400);

    expect((response.body as ErrorResponse).error.message).toBe(
      "One or more attachments are invalid",
    );
  });
});
