import type { BudgetAlertRow } from "@/lib/budgets/alerts";

export type AlertContextTransaction = {
  amount: number;
  merchant: string;
  category: string | null;
  ai_classification: "wise" | "useless" | null;
};

export type BudgetAlertGuidance = {
  categoryLabel: string;
  percentUsed: number;
  remainingAmount: number;
  overspendAmount: number;
  categoryStatus: string;
  recommendedActions: string[];
};

export function monthBoundsFromKey(monthKey: string) {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);

  const safeYear = Number.isFinite(year) ? year : new Date().getUTCFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;

  const start = new Date(Date.UTC(safeYear, safeMonth - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear, safeMonth, 1, 0, 0, 0, 0));
  return { start, end };
}

export function buildBudgetAlertGuidance(input: {
  alert: BudgetAlertRow;
  budgetCategory: string | null;
  categoryTransactions: AlertContextTransaction[];
}): BudgetAlertGuidance {
  const categoryLabel = input.budgetCategory?.trim() || "uncategorized";
  const categoryKey = categoryLabel.toLowerCase();

  const scoped = input.categoryTransactions.filter((row) => {
    const txCategory = (row.category?.trim() || "uncategorized").toLowerCase();
    return txCategory === categoryKey;
  });

  const spent = Number(input.alert.spent_amount);
  const limit = Number(input.alert.budget_limit);
  const percentUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const remainingAmount = Math.max(0, limit - spent);
  const overspendAmount = Math.max(0, spent - limit);

  const uselessRows = scoped.filter((row) => row.ai_classification === "useless");
  const uselessSpend = uselessRows.reduce((sum, row) => sum + row.amount, 0);

  const merchantCounts = new Map<string, number>();
  for (const row of uselessRows.length > 0 ? uselessRows : scoped) {
    const key = row.merchant.trim();
    if (!key) continue;
    merchantCounts.set(key, (merchantCounts.get(key) ?? 0) + 1);
  }

  const topMerchant = [...merchantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let categoryStatus = `At ${percentUsed}% of monthly budget.`;
  if (overspendAmount > 0) {
    categoryStatus = `Over budget by INR ${overspendAmount.toFixed(2)}.`;
  } else if (remainingAmount > 0) {
    categoryStatus = `INR ${remainingAmount.toFixed(2)} remaining this month.`;
  }

  const recommendedActions: string[] = [];

  if (overspendAmount > 0) {
    const weeklyRecovery = Math.ceil(overspendAmount / 2);
    recommendedActions.push(
      `Reduce ${categoryLabel} spend by about INR ${weeklyRecovery.toFixed(0)} per week for the next 2 weeks to recover overspend.`,
    );
  } else {
    const protectiveCap = Math.max(0, remainingAmount * 0.7);
    recommendedActions.push(
      `Set a short-term cap of INR ${protectiveCap.toFixed(0)} for the rest of this month in ${categoryLabel}.`,
    );
  }

  if (uselessSpend > 0) {
    recommendedActions.push(
      `Recent AI reviews flagged about INR ${uselessSpend.toFixed(2)} as potentially wasteful in this category; prioritize avoiding similar spends.`,
    );
  }

  if (topMerchant) {
    recommendedActions.push(
      `Watch repeat spend at ${topMerchant}; delaying or replacing one purchase there can improve this budget quickly.`,
    );
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push(
      `Review the last 5 transactions in ${categoryLabel} and mark one optional purchase to defer this week.`,
    );
  }

  return {
    categoryLabel,
    percentUsed,
    remainingAmount,
    overspendAmount,
    categoryStatus,
    recommendedActions,
  };
}
