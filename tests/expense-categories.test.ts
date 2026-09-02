import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORIES,
  formatExpenseCategoryDisplay,
  getCategoryTitle,
  getExpenseCategoryTree,
  normalizeSubCategoryText,
  resolveExpenseCategory,
} from "../src/constants/expense-categories.js";

describe("expense-categories", () => {
  it("exposes 20 standard categories", () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(20);
    expect(EXPENSE_CATEGORIES).toContain("food_and_dining");
    expect(EXPENSE_CATEGORIES).toContain("transportation");
  });

  it("returns the category tree for clients", () => {
    const tree = getExpenseCategoryTree();
    expect(
      tree.find((item) => item.slug === "food_and_dining")?.subCategorySuggestions,
    ).toEqual(expect.arrayContaining(["Snacks"]));
  });

  it("maps common aliases to canonical category slugs", () => {
    expect(resolveExpenseCategory("food")).toBe("food_and_dining");
    expect(resolveExpenseCategory("transport")).toBe("transportation");
  });

  it("resolves unknown categories to other", () => {
    expect(resolveExpenseCategory("unknown")).toBe("other");
    expect(resolveExpenseCategory("food_and_dining")).toBe("food_and_dining");
  });

  it("normalizes free-text sub-categories", () => {
    expect(normalizeSubCategoryText("  WiFi Recharge ")).toBe("WiFi Recharge");
    expect(normalizeSubCategoryText("")).toBe("");
    expect(normalizeSubCategoryText(undefined)).toBe("");
  });

  it("formats display labels for category and sub-category", () => {
    expect(getCategoryTitle("transportation")).toBe("Transportation");
    expect(formatExpenseCategoryDisplay("transportation", "Fuel")).toBe(
      "Transportation · Fuel",
    );
    expect(formatExpenseCategoryDisplay("transportation", "")).toBe("Transportation");
  });

  it("includes suggestion lists for every category", () => {
    for (const category of getExpenseCategoryTree()) {
      expect(category.subCategorySuggestions.length).toBeGreaterThan(0);
    }
  });
});
