import { describe, expect, it } from "vitest";
import {
  formatThreadTitle,
  getDayKey,
  resolveEffectiveTimezone,
} from "../src/utils/thread-title.js";

describe("thread title helpers (Batch 4)", () => {
  it("formats titles from dayKey and sequence", () => {
    expect(formatThreadTitle("2026-08-26", 1)).toBe("26 Aug 2026 · Thread 1");
    expect(formatThreadTitle("2026-01-05", 3)).toBe("5 Jan 2026 · Thread 3");
  });

  it("computes dayKey in a timezone", () => {
    const date = new Date("2026-08-26T10:00:00.000Z");
    expect(getDayKey(date, "UTC")).toBe("2026-08-26");
    expect(getDayKey(date, "Asia/Kolkata")).toBe("2026-08-26");
  });

  it("resolves auto timezone to UTC", () => {
    expect(resolveEffectiveTimezone("auto")).toBe("UTC");
    expect(resolveEffectiveTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});
