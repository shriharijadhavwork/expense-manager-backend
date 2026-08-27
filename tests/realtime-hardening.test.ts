import { describe, expect, it } from "vitest";
import {
  isAllowedRealtimeOrigin,
  resolveRealtimeCorsOrigins,
} from "../src/realtime/cors-origins.js";
import { JoinThrottle } from "../src/realtime/join-throttle.js";

describe("realtime cors origins (Batch R4)", () => {
  it("includes localhost and 127.0.0.1 aliases", () => {
    const origins = resolveRealtimeCorsOrigins("http://localhost:3000");
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://127.0.0.1:3000");
  });

  it("matches origins with trailing slash normalization", () => {
    const origins = resolveRealtimeCorsOrigins("http://localhost:3000/");
    expect(
      isAllowedRealtimeOrigin("http://localhost:3000", origins),
    ).toBe(true);
    expect(
      isAllowedRealtimeOrigin("http://127.0.0.1:3000", origins),
    ).toBe(true);
    expect(
      isAllowedRealtimeOrigin("http://evil.example.com", origins),
    ).toBe(false);
  });
});

describe("join throttle (Batch R4)", () => {
  it("limits join attempts per socket within the window", () => {
    const throttle = new JoinThrottle({
      enabled: true,
      maxPerWindow: 3,
      windowMs: 60_000,
    });

    expect(throttle.tryConsume("socket-1")).toBe(true);
    expect(throttle.tryConsume("socket-1")).toBe(true);
    expect(throttle.tryConsume("socket-1")).toBe(true);
    expect(throttle.tryConsume("socket-1")).toBe(false);

    expect(throttle.tryConsume("socket-2")).toBe(true);
  });

  it("clears counters on disconnect", () => {
    const throttle = new JoinThrottle({
      enabled: true,
      maxPerWindow: 2,
      windowMs: 60_000,
    });

    expect(throttle.tryConsume("socket-1")).toBe(true);
    expect(throttle.tryConsume("socket-1")).toBe(true);
    expect(throttle.tryConsume("socket-1")).toBe(false);

    throttle.clear("socket-1");
    expect(throttle.tryConsume("socket-1")).toBe(true);
  });
});
