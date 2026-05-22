import "server-only";

import type {
  BankStatementAnalysis,
  ParsedBankStatement,
  ParsedStatementTransaction,
} from "@/lib/ingestion/bank-statement-types";

function sumAmounts(rows: ParsedStatementTransaction[], direction: "credit" | "debit") {
  return Number(
    rows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum + row.amount, 0)
      .toFixed(2),
  );
}

function buildTopCategories(rows: ParsedStatementTransaction[]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.direction !== "debit") {
      continue;
    }

    const key = row.category?.trim() || "Uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function buildRecurringPayments(rows: ParsedStatementTransaction[]) {
  const grouped = new Map<string, { amount: number; occurrences: number }>();

  for (const row of rows) {
    if (row.direction !== "debit") {
      continue;
    }

    const key = row.description.trim().toLowerCase();
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { amount: row.amount, occurrences: 1 });
      continue;
    }

    current.amount = Number(((current.amount + row.amount) / 2).toFixed(2));
    current.occurrences += 1;
  }

  return [...grouped.entries()]
    .map(([description, stats]) => ({
      description,
      amount: stats.amount,
      occurrences: stats.occurrences,
    }))
    .filter((row) => row.occurrences >= 2)
    .sort((left, right) => right.occurrences - left.occurrences || right.amount - left.amount)
    .slice(0, 5);
}

function inferBalanceTrend(statement: ParsedBankStatement) {
  if (statement.openingBalance === null || statement.closingBalance === null) {
    return "unknown" as const;
  }

  const delta = statement.closingBalance - statement.openingBalance;
  if (Math.abs(delta) < 1) {
    return "flat" as const;
  }

  return delta > 0 ? "up" as const : "down" as const;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function analyzeBankStatement(
  statement: ParsedBankStatement,
): Promise<BankStatementAnalysis> {
  const totalCredits = sumAmounts(statement.transactions, "credit");
  const totalDebits = sumAmounts(statement.transactions, "debit");
  const salaryCredits = Number(
    statement.transactions
      .filter((row) => row.direction === "credit" && row.isSalary)
      .reduce((sum, row) => sum + row.amount, 0)
      .toFixed(2),
  );
  const netCashflow = Number((totalCredits - totalDebits).toFixed(2));
  const savingsRate = totalCredits > 0 ? Math.round((netCashflow / totalCredits) * 100) : null;
  const recurringPayments = buildRecurringPayments(statement.transactions);
  const topCategories = buildTopCategories(statement.transactions);
  const balanceTrend = inferBalanceTrend(statement);

  const riskIndicators: string[] = [];
  const recommendations: string[] = [];

  if (savingsRate !== null && savingsRate < 10) {
    riskIndicators.push("Savings rate is below 10% of credited income for this statement window.");
    recommendations.push("Review the top debit categories and cap at least one non-essential category next cycle.");
  }

  if (recurringPayments.length >= 3) {
    riskIndicators.push("Multiple recurring payments were detected; subscription and EMI load may be compressing free cash flow.");
    recommendations.push("Review recurring payments for services or EMIs that can be consolidated or paused.");
  }

  if (balanceTrend === "down") {
    riskIndicators.push("Closing balance is lower than opening balance, indicating downward liquidity during the statement period.");
    recommendations.push("Consider moving salary-linked bills earlier and limiting discretionary spend after large fixed payments.");
  }

  if (salaryCredits === 0) {
    riskIndicators.push("No salary-like income entries were detected automatically; income classification may need review.");
  }

  const dominantCategory = topCategories[0];
  if (dominantCategory) {
    recommendations.push(
      `Track ${dominantCategory.category.toLowerCase()} closely; it is currently the largest statement-driven spend bucket.`,
    );
  }

  const scoreBase = 70 + (savingsRate ?? 0) * 0.6;
  const penalty = riskIndicators.length * 8;
  const healthScore = clampScore(scoreBase - penalty);

  const financialHealth =
    healthScore >= 75
      ? "Stable"
      : healthScore >= 55
        ? "Watchful"
        : "At risk";

  const summary =
    totalCredits > 0
      ? `This statement shows INR ${totalCredits.toFixed(0)} in credits against INR ${totalDebits.toFixed(0)} in debits, with ${savingsRate ?? 0}% estimated savings retention.`
      : `This statement shows INR ${totalDebits.toFixed(0)} in debits, but income entries were limited or not clearly identifiable.`;

  return {
    provider: "heuristic",
    healthScore,
    summary,
    financialHealth,
    totalCredits,
    totalDebits,
    netCashflow,
    savingsRate,
    salaryCredits,
    recurringPayments,
    topCategories,
    riskIndicators,
    recommendations,
    balanceTrend,
  };
}
