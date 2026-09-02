import { afterEach, describe, expect, it } from "vitest";

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

const { aiService } = await import("../src/ai/services/ai.service.js");
const { agentOutputSchema } = await import(
  "../src/ai/schemas/agent-output.schema.js"
);
import type { LlmProvider } from "../src/ai/types.js";

function createMockProvider(
  handler: LlmProvider["generateStructured"],
): LlmProvider {
  return {
    name: "mock",
    generateStructured: handler,
  };
}

describe("aiService (Batch 1)", () => {
  afterEach(() => {
    aiService.setProvider(null);
    aiService.resetDefaultProvider();
  });

  it("reports not configured when GEMINI_API_KEY is absent", () => {
    const status = aiService.getHealthStatus();

    expect(status.configured).toBe(false);
    expect(status.provider).toBeNull();
    expect(status.model).toBe("gemini-2.5-flash");
    expect(status.debounceMs).toBe(1500);
  });

  it("ping uses the injected provider and returns latency", async () => {
    const provider = createMockProvider(async <T,>() => ({ status: "ok" }) as T);
    aiService.setProvider(provider);

    const result = await aiService.ping();

    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("ping fails when AI is not configured", async () => {
    await expect(aiService.ping()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining("GEMINI_API_KEY"),
    });
  });
});

describe("agentOutputSchema (Batch 1)", () => {
  it("accepts a minimal valid agent output", () => {
    const parsed = agentOutputSchema.parse({
      intent: "create_expense",
      reply: "Got it — logging that expense.",
      expenseDraft: {
        amount: 450,
        category: "food",
        currency: "INR",
      },
      missingFields: ["date"],
      confidence: 0.92,
    });

    expect(parsed.intent).toBe("create_expense");
    expect(parsed.expenseDraft?.amount).toBe(450);
  });

  it("rejects invalid intent values", () => {
    const result = agentOutputSchema.safeParse({
      intent: "delete_everything",
      reply: "nope",
    });

    expect(result.success).toBe(false);
  });
});
