import { z } from "zod";

type ExpenseCategoryTreeEntry = {
  readonly slug: string;
  readonly title: string;
  readonly subCategorySuggestions: readonly string[];
};

export const EXPENSE_CATEGORY_TREE = [
  {
    slug: "food_and_dining",
    title: "Food & Dining",
    subCategorySuggestions: [
      "Groceries",
      "Restaurants",
      "Snacks",
      "Coffee & Tea",
      "Food Delivery",
      "Alcohol",
      "Other",
    ],
  },
  {
    slug: "utilities",
    title: "Utilities",
    subCategorySuggestions: [
      "Electricity",
      "Water",
      "Gas",
      "Internet",
      "Mobile Recharge",
      "WiFi Recharge",
      "Other",
    ],
  },
  {
    slug: "transportation",
    title: "Transportation",
    subCategorySuggestions: [
      "Fuel",
      "Public Transit",
      "Ride Hailing",
      "Parking",
      "Tolls",
      "Vehicle Maintenance",
      "Other",
    ],
  },
  {
    slug: "shopping",
    title: "Shopping",
    subCategorySuggestions: [
      "Clothing",
      "Electronics",
      "Home Goods",
      "Online Shopping",
      "Other",
    ],
  },
  {
    slug: "housing",
    title: "Housing",
    subCategorySuggestions: ["Rent", "Mortgage", "Maintenance", "Furniture", "Other"],
  },
  {
    slug: "healthcare",
    title: "Healthcare",
    subCategorySuggestions: [
      "Doctor",
      "Pharmacy",
      "Dental",
      "Vision",
      "Lab Tests",
      "Other",
    ],
  },
  {
    slug: "entertainment",
    title: "Entertainment",
    subCategorySuggestions: ["Movies", "Games", "Events", "Hobbies", "Other"],
  },
  {
    slug: "personal_care",
    title: "Personal Care",
    subCategorySuggestions: ["Salon & Spa", "Grooming", "Fitness", "Other"],
  },
  {
    slug: "travel",
    title: "Travel",
    subCategorySuggestions: [
      "Flights",
      "Hotels",
      "Local Transport",
      "Activities",
      "Other",
    ],
  },
  {
    slug: "education",
    title: "Education",
    subCategorySuggestions: ["Tuition", "Books & Supplies", "Courses", "Other"],
  },
  {
    slug: "financial",
    title: "Financial",
    subCategorySuggestions: [
      "Salary",
      "Interest",
      "Investment",
      "Transfer",
      "Bank Fees",
      "Refund",
      "Other",
    ],
  },
  {
    slug: "subscriptions",
    title: "Subscriptions",
    subCategorySuggestions: ["Streaming", "Software", "Memberships", "Other"],
  },
  {
    slug: "insurance",
    title: "Insurance",
    subCategorySuggestions: ["Health", "Life", "Vehicle", "Home", "Other"],
  },
  {
    slug: "family_and_children",
    title: "Family & Children",
    subCategorySuggestions: ["Childcare", "School", "Activities", "Other"],
  },
  {
    slug: "pets",
    title: "Pets",
    subCategorySuggestions: ["Pet Food", "Veterinary", "Grooming", "Other"],
  },
  {
    slug: "gifts_and_donations",
    title: "Gifts & Donations",
    subCategorySuggestions: ["Gifts", "Charity", "Personal Transfer", "Other"],
  },
  {
    slug: "taxes",
    title: "Taxes",
    subCategorySuggestions: ["Income Tax", "Property Tax", "Other"],
  },
  {
    slug: "bills_and_payments",
    title: "Bills & Payments",
    subCategorySuggestions: ["Credit Card", "Loan EMI", "Service Fee", "Other"],
  },
  {
    slug: "business",
    title: "Business",
    subCategorySuggestions: ["Supplies", "Services", "Business Travel", "Other"],
  },
  {
    slug: "other",
    title: "Other",
    subCategorySuggestions: ["Other"],
  },
] as const satisfies readonly ExpenseCategoryTreeEntry[];

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_TREE)[number]["slug"];

export type ExpenseCategoryDef = {
  slug: ExpenseCategory;
  title: string;
  subCategorySuggestions: readonly string[];
};

export const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_TREE.map(
  (category) => category.slug,
) as [ExpenseCategory, ...ExpenseCategory[]];

export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);

export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "other";

/** Trim and cap length; preserve human-readable sub-category text. */
export function normalizeSubCategoryText(
  raw: string | undefined | null,
): string {
  if (!raw) {
    return "";
  }

  return raw.trim().replace(/\s+/g, " ").slice(0, 100);
}

export const expenseSubCategorySchema = z
  .string()
  .trim()
  .max(100, "Sub-category must be at most 100 characters")
  .transform(normalizeSubCategoryText);

const categoryBySlug = new Map(
  EXPENSE_CATEGORY_TREE.map((category) => [category.slug, category]),
);

const CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  food: "food_and_dining",
  dining: "food_and_dining",
  transport: "transportation",
  transit: "transportation",
  utilities: "utilities",
  shopping: "shopping",
  housing: "housing",
  health: "healthcare",
  healthcare: "healthcare",
  entertainment: "entertainment",
  travel: "travel",
  education: "education",
  financial: "financial",
  income: "financial",
  transfer: "financial",
  subscription: "subscriptions",
  subscriptions: "subscriptions",
  insurance: "insurance",
  pets: "pets",
  taxes: "taxes",
  business: "business",
};

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return categoryBySlug.has(value as ExpenseCategory);
}

export function getCategoryDef(
  category: ExpenseCategory,
): ExpenseCategoryDef | undefined {
  return categoryBySlug.get(category);
}

/** Display title for UI and chat replies — never show the slug to users. */
export function getCategoryTitle(category: ExpenseCategory): string {
  return getCategoryDef(category)?.title ?? category;
}

/** @deprecated Use getCategoryTitle */
export const getCategoryLabel = getCategoryTitle;

export function formatExpenseCategoryDisplay(
  category: ExpenseCategory,
  subCategory: string,
): string {
  const title = getCategoryTitle(category);
  const detail = normalizeSubCategoryText(subCategory);

  if (!detail) {
    return title;
  }

  return `${title} · ${detail}`;
}

/** @deprecated Use formatExpenseCategoryDisplay */
export const formatExpenseCategoryPair = formatExpenseCategoryDisplay;

export function resolveExpenseCategory(
  raw: string | undefined | null,
): ExpenseCategory {
  if (!raw) {
    return DEFAULT_EXPENSE_CATEGORY;
  }

  const normalized = normalizeSlug(raw);
  const aliased = CATEGORY_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }

  if (isExpenseCategory(normalized)) {
    return normalized;
  }

  return DEFAULT_EXPENSE_CATEGORY;
}

/** Compact slug list for LLM extraction prompts. */
export function formatCategorySlugsForPrompt(): string {
  return EXPENSE_CATEGORY_TREE.map((category) => category.slug).join(", ");
}

export type ExpenseCategoryTreeResponse = typeof EXPENSE_CATEGORY_TREE;

export function getExpenseCategoryTree(): ExpenseCategoryTreeResponse {
  return EXPENSE_CATEGORY_TREE;
}
