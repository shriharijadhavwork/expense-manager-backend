import { describe, expect, it } from "vitest";
import { resolveExpenseDirection } from "../src/constants/expense-direction.js";

describe("resolveExpenseDirection", () => {
  it("returns explicit direction when set", () => {
    expect(resolveExpenseDirection("credit")).toBe("credit");
    expect(resolveExpenseDirection("debit")).toBe("debit");
  });

  it("defaults to debit when unset", () => {
    expect(resolveExpenseDirection()).toBe("debit");
    expect(resolveExpenseDirection(null)).toBe("debit");
  });
});
