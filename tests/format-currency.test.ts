import { describe, expect, it } from "vitest";
import {
  formatDisplayAmount,
  formatGroupedAmount,
  presentMoney,
  withCurrencySymbol,
} from "../src/utils/format-currency.js";

describe("formatGroupedAmount", () => {
  it("groups INR whole amounts without decimals or symbol", () => {
    expect(formatGroupedAmount(500, "INR")).toBe("500");
    expect(formatGroupedAmount(50000, "INR")).toBe("50,000");
  });

  it("formats USD decimals without symbol", () => {
    expect(formatGroupedAmount(10.5, "USD")).toBe("10.50");
    expect(formatGroupedAmount(100, "USD")).toBe("100");
  });

  it("groups JPY without fractional digits", () => {
    expect(formatGroupedAmount(1500, "JPY")).toBe("1,500");
  });

  it("normalizes lowercase currency codes", () => {
    expect(formatGroupedAmount(100, "usd")).toBe("100");
  });

  it("throws for non-finite amounts", () => {
    expect(() => formatGroupedAmount(Number.NaN, "INR")).toThrow(RangeError);
  });
});

describe("withCurrencySymbol", () => {
  it("prefixes INR amounts", () => {
    expect(withCurrencySymbol("300", "INR")).toBe("₹300");
  });

  it("prefixes USD amounts", () => {
    expect(withCurrencySymbol("15", "USD")).toBe("$15");
  });
});

describe("formatDisplayAmount", () => {
  it("formats INR with symbol and grouping", () => {
    expect(formatDisplayAmount(300, "INR")).toBe("₹300");
    expect(formatDisplayAmount(50000, "INR")).toBe("₹50,000");
  });
});

describe("presentMoney", () => {
  it("returns grouped amount without symbol for agents and APIs", () => {
    const result = presentMoney(50000, "INR");

    expect(result).toEqual({
      amount: 50000,
      currency: "INR",
      formattedAmount: "50,000",
      locale: "en-IN",
    });
  });
});
