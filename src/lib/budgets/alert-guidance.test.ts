import { describe, expect, it } from "vitest";
import { buildBudgetAlertGuidance, monthBoundsFromKey } from "@/lib/budgets/alert-guidance";
import type { BudgetAlertRow } from "@/lib/budgets/alerts";

function createAlert(overrides?: Partial<BudgetAlertRow>): BudgetAlertRow {
  return {
    id: "a1",
    user_id: "u1",
    budget_id: "b1",
    month: "2026-05",
    threshold: 75,
    spent_amount: 760,
    budget_limit: 1000,
    channels: { in_app: true, push: true, email: false },
    message: "Food reached 75% budget usage for 2026-05.",
    created_at: "2026-05-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("monthBoundsFromKey", () => {
  it("builds stable UTC month bounds from YYYY-MM", () => {
    const bounds = monthBoundsFromKey("2026-05");

    expect(bounds.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("buildBudgetAlertGuidance", () => {
  it("shows category status, remaining amount, and context-grounded actions", () => {
    const guidance = buildBudgetAlertGuidance({
      alert: createAlert(),
      budgetCategory: "Food",
      categoryTransactions: [
        { amount: 210, merchant: "Cafe One", category: "Food", ai_classification: "useless" },
        { amount: 120, merchant: "Cafe One", category: "Food", ai_classification: "useless" },
        { amount: 95, merchant: "Fresh Mart", category: "Food", ai_classification: "wise" },
        { amount: 40, merchant: "Metro", category: "Transport", ai_classification: "useless" },
      ],
    });

    expect(guidance.categoryLabel).toBe("Food");
    expect(guidance.percentUsed).toBe(76);
    expect(guidance.remainingAmount).toBe(240);
    expect(guidance.categoryStatus).toBe("INR 240.00 remaining this month.");

    expect(guidance.recommendedActions.some((item) => item.includes("Set a short-term cap"))).toBe(true);
    expect(guidance.recommendedActions.some((item) => item.includes("potentially wasteful"))).toBe(true);
    expect(guidance.recommendedActions.some((item) => item.includes("Cafe One"))).toBe(true);
  });

  it("uses spending context fallback when classification context is unavailable", () => {
    const guidance = buildBudgetAlertGuidance({
      alert: createAlert({ spent_amount: 680, budget_limit: 1000 }),
      budgetCategory: "Entertainment",
      categoryTransactions: [
        { amount: 280, merchant: "Cinema Hub", category: "Entertainment", ai_classification: null },
        { amount: 80, merchant: "Cinema Hub", category: "Entertainment", ai_classification: null },
        { amount: 90, merchant: "Arcade", category: "Entertainment", ai_classification: null },
      ],
    });

    expect(guidance.recommendedActions.some((item) => item.includes("potentially wasteful"))).toBe(false);
    expect(guidance.recommendedActions.some((item) => item.includes("Cinema Hub"))).toBe(true);
  });

  it("reports overspend status and recovery action when budget is exceeded", () => {
    const guidance = buildBudgetAlertGuidance({
      alert: createAlert({ threshold: 100, spent_amount: 1260, budget_limit: 1000 }),
      budgetCategory: "Shopping",
      categoryTransactions: [
        { amount: 320, merchant: "Mall Store", category: "Shopping", ai_classification: "useless" },
      ],
    });

    expect(guidance.percentUsed).toBe(126);
    expect(guidance.overspendAmount).toBe(260);
    expect(guidance.categoryStatus).toBe("Over budget by INR 260.00.");
    expect(guidance.recommendedActions[0]).toContain("recover overspend");
  });
});
