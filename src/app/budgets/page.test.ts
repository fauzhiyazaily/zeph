import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const createServerSupabaseClientMock = vi.fn();
const buildBudgetAlertGuidanceMock = vi.fn();
const evaluateBudgetAlertsMock = vi.fn();
const getOrCreateBudgetAlertPreferenceMock = vi.fn();
const computeBudgetUtilizationMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/app/components/app-shell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/app/budgets/actions", () => ({
  deleteBudget: vi.fn(),
  saveBudgetAlertPreferences: vi.fn(),
  upsertBudget: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/budgets/alerts", () => ({
  evaluateBudgetAlerts: (...args: unknown[]) => evaluateBudgetAlertsMock(...args),
  getOrCreateBudgetAlertPreference: (...args: unknown[]) => getOrCreateBudgetAlertPreferenceMock(...args),
}));

vi.mock("@/lib/budgets/alert-guidance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/budgets/alert-guidance")>(
    "@/lib/budgets/alert-guidance",
  );

  return {
    ...actual,
    buildBudgetAlertGuidance: (...args: unknown[]) => buildBudgetAlertGuidanceMock(...args),
  };
});

vi.mock("@/lib/budgets/utilization", () => ({
  computeBudgetUtilization: (...args: unknown[]) => computeBudgetUtilizationMock(...args),
}));

vi.mock("@/lib/budgets/budget-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/budgets/budget-helpers")>(
    "@/lib/budgets/budget-helpers",
  );

  return {
    ...actual,
    currentMonthKey: vi.fn(() => "2026-05"),
  };
});

function createFluentBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

describe("budgets page corrective guidance", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    evaluateBudgetAlertsMock.mockResolvedValue({ generatedCount: 0 });
    getOrCreateBudgetAlertPreferenceMock.mockResolvedValue({
      user_id: "u1",
      alert_75_enabled: true,
      alert_100_enabled: true,
      in_app_enabled: true,
      push_enabled: true,
      email_enabled: false,
      updated_at: "2026-05-22T00:00:00.000Z",
    });
    computeBudgetUtilizationMock.mockResolvedValue([
      {
        budget: {
          id: "b1",
          user_id: "u1",
          category: "Food",
          month: "2026-05",
          amount_limit: 1000,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        spent: 760,
        remaining: 240,
        pct: 76,
        isOver: false,
        isNearLimit: true,
      },
    ]);
    buildBudgetAlertGuidanceMock.mockReturnValue({
      categoryLabel: "Food",
      percentUsed: 76,
      remainingAmount: 240,
      overspendAmount: 0,
      categoryStatus: "INR 240.00 remaining this month.",
      recommendedActions: [
        "Set a short-term cap of INR 168 for the rest of this month in Food.",
        "Recent AI reviews flagged about INR 330.00 as potentially wasteful in this category; prioritize avoiding similar spends.",
      ],
    });
  });

  it("renders alert detail view with category status, remaining amount, and recommendations", async () => {
    const budgetsBuilder = createFluentBuilder([
      {
        id: "b1",
        user_id: "u1",
        category: "Food",
        month: "2026-05",
        amount_limit: 1000,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const alertsBuilder = createFluentBuilder([
      {
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
      },
    ]);

    const transactionsBuilder = createFluentBuilder([
      { amount: 210, merchant: "Cafe One", category: "Food", ai_classification: "useless" },
      { amount: 120, merchant: "Cafe One", category: "Food", ai_classification: "useless" },
    ]);

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(budgetsBuilder)
      .mockReturnValueOnce(alertsBuilder)
      .mockReturnValueOnce(transactionsBuilder);

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { default: BudgetsPage } = await import("@/app/budgets/page");

    const element = await BudgetsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View corrective guidance");
    expect(html).toContain("Category:");
    expect(html).toContain("Status: INR 240.00 remaining this month.");
    expect(html).toContain("Remaining amount: INR 240.00");
    expect(html).toContain("Set a short-term cap");
    expect(html).toContain("potentially wasteful");

    expect(buildBudgetAlertGuidanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetCategory: "Food",
        categoryTransactions: expect.arrayContaining([
          expect.objectContaining({ merchant: "Cafe One", ai_classification: "useless" }),
        ]),
      }),
    );
  });

  it("redirects unauthenticated users to sign-in", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { default: BudgetsPage } = await import("@/app/budgets/page");

    await expect(BudgetsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });
});
