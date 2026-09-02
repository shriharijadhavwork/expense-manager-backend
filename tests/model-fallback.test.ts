import { afterEach, describe, expect, it, vi } from "vitest";

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
process.env["GEMINI_MODEL"] = "gemini-3.6-flash";
process.env["GEMINI_MODEL_LITE"] = "gemini-3.1-flash-lite";
process.env["GEMINI_MODEL_STANDARD"] = "gemini-3.6-flash";
process.env["GEMINI_MODEL_FALLBACK"] = "gemini-3.5-flash,gemini-3.1-flash-lite";
process.env["AI_MODEL_FALLBACK_ENABLED"] = "true";

const { getModelCandidates, getModelTierForCallSite } = await import(
  "../src/ai/provider/model-registry.js"
);
const { isRetryableLlmError } = await import(
  "../src/ai/utils/is-retryable-llm-error.js"
);
const { generateWithModelFallback } = await import(
  "../src/ai/provider/generate-with-model-fallback.js"
);

describe("model registry (Batch 2)", () => {
  it("uses lite tier for classify and reply call sites", () => {
    expect(getModelTierForCallSite("classify_intent")).toBe("lite");
    expect(getModelTierForCallSite("build_reply")).toBe("lite");
    expect(getModelTierForCallSite("extract_expense")).toBe("standard");
  });

  it("returns primary then fallback models", () => {
    expect(getModelCandidates("extract_expense")).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ]);
    expect(getModelCandidates("classify_intent")).toEqual([
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
    ]);
  });

  it("excludes already-tried models", () => {
    expect(
      getModelCandidates("extract_expense", ["gemini-3.6-flash"]),
    ).toEqual(["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
  });
});

describe("retryable llm errors (Batch 2)", () => {
  it("treats 503 high demand as retryable", () => {
    expect(
      isRetryableLlmError(
        new Error("[503 Service Unavailable] high demand"),
      ),
    ).toBe(true);
  });

  it("treats auth errors as non-retryable", () => {
    expect(isRetryableLlmError(new Error("[403 Forbidden] invalid api key"))).toBe(
      false,
    );
  });
});

describe("generateWithModelFallback (Batch 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the next model after a retryable failure", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("[503 Service Unavailable] high demand"))
      .mockResolvedValueOnce("ok");

    const result = await generateWithModelFallback({
      callSite: "extract_expense",
      invoke,
    });

    expect(result.result).toBe("ok");
    expect(result.modelUsed).toBe("gemini-3.5-flash");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.attempts).toHaveLength(2);
  });

  it("does not retry non-retryable auth failures", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValue(new Error("[403 Forbidden] invalid api key"));

    await expect(
      generateWithModelFallback({
        callSite: "extract_expense",
        invoke,
      }),
    ).rejects.toThrow("403");

    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
