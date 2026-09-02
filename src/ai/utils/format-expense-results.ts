import type { SafeExpense, SpendingSummary } from "../../services/expense.service.js";

export function formatExpenseList(expenses: SafeExpense[]): string {
  if (expenses.length === 0) {
    return "I didn't find any matching expenses.";
  }

  const lines = expenses.slice(0, 5).map((expense) => {
    const note = expense.note ? ` — ${expense.note}` : "";
    return `• ${expense.formattedAmount} ${expense.currency} on ${expense.date} (${expense.categoryLabel})${note}`;
  });

  const suffix =
    expenses.length > 5
      ? `\n…and ${expenses.length - 5} more.`
      : "";

  return `Here are your matching expenses:\n${lines.join("\n")}${suffix}`;
}

export function formatSpendingSummary(summary: SpendingSummary): string {
  if (summary.count === 0) {
    return "I didn't find any expenses in that period.";
  }

  const totalLine = summary.totals
    .map((total) => `${total.formattedAmount} ${total.currency}`)
    .join(" + ");

  const categoryLines = summary.byCategory
    .slice(0, 5)
    .map(
      (row) =>
        `• ${row.category}: ${row.formattedAmount} ${row.currency} (${row.count})`,
    );

  const suffix =
    summary.byCategory.length > 5
      ? `\n…and ${summary.byCategory.length - 5} more categories.`
      : "";

  return `You spent ${totalLine} across ${summary.count} expense${summary.count === 1 ? "" : "s"}.\n${categoryLines.join("\n")}${suffix}`;
}
