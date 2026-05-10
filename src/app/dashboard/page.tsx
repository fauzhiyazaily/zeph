import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import {
  assignTransactionCategory,
  bulkAssignTransactionCategory,
  editTransactionDetails,
  saveRecommendationAction,
} from "@/app/dashboard/actions";
import { DashboardStatusBanner } from "@/app/dashboard/status-banner";
import {
  evaluateBudgetAlerts,
  getOrCreateBudgetAlertPreference,
  type BudgetAlertRow,
} from "@/lib/budgets/alerts";
import {
  buildBudgetAlertGuidance,
  monthBoundsFromKey,
  type AlertContextTransaction,
} from "@/lib/budgets/alert-guidance";
import { currentMonthKey, type Budget } from "@/lib/budgets/budget-helpers";
import { computeBudgetUtilization } from "@/lib/budgets/utilization";
import { getMessageReadingConsent } from "@/lib/consent";
import {
  buildCategoryBreakdown,
  buildWaffleCells,
  periodBounds,
  type SpendRecord,
} from "@/lib/insights/category-breakdown";
import {
  buildHabitTrendInsights,
  type ClassifiedTransaction,
} from "@/lib/insights/habit-trends";
import { type Goal } from "@/lib/goals/goal-helpers";
import {
  evaluateGoalMilestones,
  type GoalMilestoneRow,
} from "@/lib/goals/milestones";
import { computeGoalProgress, summarizeGoalProgress } from "@/lib/goals/progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TransactionQueueRow = {
  id: string;
  amount: number;
  merchant: string;
  source: string;
  reference: string | null;
  date: string;
  category: string | null;
  ai_classification: "wise" | "useless" | null;
  ai_reason: string | null;
  ai_raw_classification: "wise" | "useless" | null;
  ai_raw_reason: string | null;
  ai_user_classification: "wise" | "useless" | null;
  ai_user_reason: string | null;
  ai_review_state: "pending" | "accepted" | "overridden";
};

type RecentTransactionRow = TransactionQueueRow;

type InsightRow = {
  id: string;
  amount: number;
  date: string;
  category: string | null;
  ai_classification: "wise" | "useless" | null;
};

type FocusedRecommendationRow = {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string | null;
  ai_classification: "wise" | "useless" | null;
  ai_reason: string | null;
};

const suggestedCategories = [
  "Food",
  "Transport",
  "Groceries",
  "Bills",
  "Shopping",
  "Health",
  "Entertainment",
  "Other",
];

const wafflePalette: Record<string, string> = {
  Food: "bg-amber-400",
  Transport: "bg-sky-400",
  Groceries: "bg-emerald-400",
  Bills: "bg-indigo-400",
  Shopping: "bg-rose-400",
  Health: "bg-lime-400",
  Entertainment: "bg-fuchsia-400",
  Uncategorized: "bg-slate-400",
  Other: "bg-zinc-400",
};

type DashboardPageProps = {
  searchParams: Promise<{
    period?: string;
    categoryFocus?: string;
  }>;
};

function queryString(input: { period?: string; categoryFocus?: string }) {
  const params = new URLSearchParams();
  if (input.period) params.set("period", input.period);
  if (input.categoryFocus) params.set("categoryFocus", input.categoryFocus);
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const period = params.period === "last" ? "last" : "this";
  const categoryFocus = (params.categoryFocus ?? "").trim();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const consent = getMessageReadingConsent(user);
  const { data: uncategorized, error: queueError } = await supabase
    .from("transactions")
    .select(
      "id,amount,merchant,source,reference,date,category,ai_classification,ai_reason,ai_raw_classification,ai_raw_reason,ai_user_classification,ai_user_reason,ai_review_state",
    )
    .eq("user_id", user.id)
    .or("category.is.null,category.eq.")
    .order("date", { ascending: false })
    .limit(12)
    .returns<TransactionQueueRow[]>();

  const uncategorizedTransactions = uncategorized ?? [];
  const { data: recentTransactions, error: recentError } = await supabase
    .from("transactions")
    .select(
      "id,amount,merchant,source,reference,date,category,ai_classification,ai_reason,ai_raw_classification,ai_raw_reason,ai_user_classification,ai_user_reason,ai_review_state",
    )
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(20)
    .returns<RecentTransactionRow[]>();

  const transactionRows = (recentTransactions ?? []).filter((row) => {
    if (!categoryFocus) {
      return true;
    }
    const normalized = row.category?.trim() || "Uncategorized";
    return normalized.toLowerCase() === categoryFocus.toLowerCase();
  });
  const { data: insightRows, error: insightError } = await supabase
    .from("transactions")
    .select("id,amount,date,category,ai_classification")
    .eq("user_id", user.id)
    .not("ai_classification", "is", null)
    .order("date", { ascending: false })
    .limit(200)
    .returns<InsightRow[]>();

  const classifiedRows: ClassifiedTransaction[] = (insightRows ?? [])
    .filter((row): row is InsightRow & { ai_classification: "wise" | "useless" } =>
      row.ai_classification === "wise" || row.ai_classification === "useless",
    )
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      date: row.date,
      category: row.category,
      aiClassification: row.ai_classification,
    }));

  const habitInsights = buildHabitTrendInsights(classifiedRows);

  const overviewBoundsCurrent = periodBounds(7, new Date(), 0);
  const overviewBoundsLast = periodBounds(7, new Date(), 7);

  const overviewStart = period === "this" ? overviewBoundsCurrent.start : overviewBoundsLast.start;
  const overviewEnd = period === "this" ? overviewBoundsCurrent.end : overviewBoundsLast.end;

  const { data: overviewRows, error: overviewError } = await supabase
    .from("transactions")
    .select("amount,category,date")
    .eq("user_id", user.id)
    .gte("date", overviewBoundsLast.start.toISOString())
    .lt("date", overviewBoundsCurrent.end.toISOString())
    .returns<SpendRecord[]>();

  const breakdown = buildCategoryBreakdown(overviewRows ?? [], overviewStart, overviewEnd);
  const waffleCells = buildWaffleCells(breakdown);
  const totalPeriodSpend = breakdown.reduce((sum, row) => sum + row.amount, 0);

  let focusedRecommendationRows: FocusedRecommendationRow[] = [];
  let focusedRecommendationError: string | null = null;

  if (categoryFocus) {
    let focusedQuery = supabase
      .from("transactions")
      .select("id,merchant,amount,date,category,ai_classification,ai_reason")
      .eq("user_id", user.id)
      .gte("date", overviewStart.toISOString())
      .lt("date", overviewEnd.toISOString())
      .order("date", { ascending: false })
      .limit(60);

    if (categoryFocus.toLowerCase() === "uncategorized") {
      focusedQuery = focusedQuery.or("category.is.null,category.eq.");
    } else {
      focusedQuery = focusedQuery.eq("category", categoryFocus);
    }

    const { data, error } = await focusedQuery.returns<FocusedRecommendationRow[]>();
    if (error) {
      focusedRecommendationError = error.message;
    } else {
      focusedRecommendationRows = data ?? [];
    }
  }

  const focusedClassifiedCount = focusedRecommendationRows.filter(
    (row) => row.ai_classification === "wise" || row.ai_classification === "useless",
  ).length;
  const focusedUselessRows = focusedRecommendationRows.filter(
    (row) => row.ai_classification === "useless",
  );
  const focusedUselessSpend = focusedUselessRows.reduce((sum, row) => sum + row.amount, 0);
  const focusedTopReason = focusedUselessRows.find((row) => row.ai_reason)?.ai_reason ?? null;
  const focusedTopMerchant = focusedUselessRows[0]?.merchant ?? null;

  const periodKey = overviewStart.toISOString().slice(0, 10);

  let recommendationAction: "accepted" | "dismissed" | null = null;
  if (categoryFocus) {
    const { data: actionRow } = await supabase
      .from("recommendation_actions")
      .select("action")
      .eq("user_id", user.id)
      .eq("category", categoryFocus.toLowerCase())
      .eq("period_key", periodKey)
      .maybeSingle<{ action: string }>();
    if (actionRow?.action === "accepted" || actionRow?.action === "dismissed") {
      recommendationAction = actionRow.action;
    }
  }

  // Budget utilization for current month
  const dashboardMonth = currentMonthKey();
  const { data: dashboardBudgets } = await supabase
    .from("budgets")
    .select("id,category,month,amount_limit,created_at,updated_at")
    .eq("user_id", user.id)
    .eq("month", dashboardMonth)
    .returns<Budget[]>();

  const dashboardBudgetList = dashboardBudgets ?? [];
  const dashboardUtilization = dashboardBudgetList.length > 0
    ? await computeBudgetUtilization(supabase, user.id, dashboardMonth, dashboardBudgetList)
    : [];

  const dashboardAlertPreference = await getOrCreateBudgetAlertPreference(supabase, user.id);
  await evaluateBudgetAlerts({
    supabase,
    userId: user.id,
    month: dashboardMonth,
    utilization: dashboardUtilization,
    preference: dashboardAlertPreference,
  });

  const { data: dashboardAlertRows } = await supabase
    .from("budget_alerts")
    .select("id,user_id,budget_id,month,threshold,spent_amount,budget_limit,channels,message,created_at")
    .eq("user_id", user.id)
    .eq("month", dashboardMonth)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<BudgetAlertRow[]>();

  const dashboardAlerts = (dashboardAlertRows ?? []).filter(
    (row) => row.channels?.in_app !== false,
  );

  const { data: dashboardGoals } = await supabase
    .from("goals")
    .select("id,user_id,name,target_amount,current_amount,deadline,notes,created_at,updated_at")
    .eq("user_id", user.id)
    .order("deadline", { ascending: true })
    .limit(6)
    .returns<Goal[]>();

  const dashboardGoalProgress = (dashboardGoals ?? []).map((goal) => computeGoalProgress(goal));
  const dashboardGoalSummary = summarizeGoalProgress(dashboardGoalProgress);

  await evaluateGoalMilestones({
    supabase,
    userId: user.id,
    rows: dashboardGoalProgress,
  });

  const { data: dashboardMilestoneRows } = await supabase
    .from("goal_milestones")
    .select("id,user_id,goal_id,milestone,progress_percent,message,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<GoalMilestoneRow[]>();

  const dashboardMilestones = dashboardMilestoneRows ?? [];

  const dashboardBudgetById = new Map(dashboardBudgetList.map((budget) => [budget.id, budget]));
  const dashboardMonthRange = monthBoundsFromKey(dashboardMonth);
  const { data: dashboardMonthTransactions } = await supabase
    .from("transactions")
    .select("amount,merchant,category,ai_classification")
    .eq("user_id", user.id)
    .gte("date", dashboardMonthRange.start.toISOString())
    .lt("date", dashboardMonthRange.end.toISOString())
    .returns<AlertContextTransaction[]>();

  const dashboardTransactionContext = dashboardMonthTransactions ?? [];
  const dashboardAlertGuidanceById = new Map(
    dashboardAlerts.map((alert) => {
      const budget = dashboardBudgetById.get(alert.budget_id);
      return [
        alert.id,
        buildBudgetAlertGuidance({
          alert,
          budgetCategory: budget?.category ?? null,
          categoryTransactions: dashboardTransactionContext,
        }),
      ] as const;
    }),
  );

  return (
    <main className="soft-fade-in relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
      <DashboardStatusBanner />

      <header className="glass-card flex flex-col gap-3 rounded-2xl p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Welcome to Zeph
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>

        <form action={signOut}>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-900">Auth foundation ready</h2>
        <p className="mt-2 text-sm text-slate-600">
          Story 1.2 baseline is active: secure registration, sign-in, OAuth entry point,
          protected routing, and session-based access to this dashboard.
        </p>

        <div className="mt-4 flex flex-wrap gap-4">
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/transactions">
            Open searchable transaction history
          </Link>
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/budgets">
            Manage budgets
          </Link>
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/goals">
            Manage goals
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-teal-200/70 bg-teal-50/55 p-6 shadow-sm shadow-teal-900/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-teal-950">Overview spend waffle</h2>
            <p className="mt-2 text-sm text-teal-900/80">
              Tap any category in the legend to cross-filter recent transactions and history context.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                period === "this"
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-teal-300 bg-white text-teal-800"
              }`}
              href={`/dashboard${queryString({ period: "this", categoryFocus })}`}
            >
              This week
            </Link>
            <Link
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                period === "last"
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-teal-300 bg-white text-teal-800"
              }`}
              href={`/dashboard${queryString({ period: "last", categoryFocus })}`}
            >
              Last week
            </Link>
          </div>
        </div>

        {overviewError ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not load overview chart data. Retry shortly.
          </p>
        ) : breakdown.length === 0 ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            No spend data available for this period yet.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-teal-900">
              Period total: INR {totalPeriodSpend.toFixed(2)}
            </p>

            <div aria-label="Waffle chart" className="mt-3 grid grid-cols-8 gap-1 sm:grid-cols-10">
              {waffleCells.map((cell, idx) => (
                <div
                  aria-label={cell.category}
                  className={`h-5 w-full rounded ${wafflePalette[cell.category] ?? "bg-slate-300"}`}
                  key={`${cell.category}-${idx}`}
                  title={cell.category}
                />
              ))}
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {breakdown.map((row) => (
                <li key={row.category}>
                  <Link
                    className="flex items-center justify-between rounded-md border border-teal-200 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-teal-50"
                    href={`/dashboard${queryString({ period, categoryFocus: row.category })}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${wafflePalette[row.category] ?? "bg-slate-300"}`}
                      />
                      {row.category}
                    </span>
                    <span>INR {row.amount.toFixed(2)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-teal-900">
              {categoryFocus ? (
                <>
                  <span>
                    Focused category: <strong>{categoryFocus}</strong>
                  </span>
                  <Link
                    className="font-medium underline"
                    href={`/dashboard${queryString({ period })}`}
                  >
                    Clear category focus
                  </Link>
                  <Link
                    className="font-medium underline"
                    href={`/transactions?category=${encodeURIComponent(categoryFocus)}&from=${overviewStart
                      .toISOString()
                      .slice(0, 10)}&to=${overviewEnd.toISOString().slice(0, 10)}`}
                  >
                    Open focused history
                  </Link>
                </>
              ) : (
                <span>Tip: Select a category in the legend to drill down.</span>
              )}
            </div>

            {categoryFocus ? (
              <div className="mt-4 rounded-lg border border-teal-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-teal-950">
                  Linked AI recommendation context
                </h3>

                {focusedRecommendationError ? (
                  <p className="mt-2 text-sm text-red-700">
                    Could not load recommendation context right now.
                  </p>
                ) : recommendationAction === "dismissed" ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">Recommendation dismissed for this period.</p>
                    <form action={saveRecommendationAction}>
                      <input type="hidden" name="category" value={categoryFocus.toLowerCase()} />
                      <input type="hidden" name="periodKey" value={periodKey} />
                      <input type="hidden" name="action" value="accepted" />
                      <button
                        type="submit"
                        className="text-xs font-medium text-teal-700 underline hover:text-teal-900"
                      >
                        Show again
                      </button>
                    </form>
                  </div>
                ) : focusedRecommendationRows.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">
                    No transactions found for {categoryFocus} in this period yet.
                  </p>
                ) : focusedClassifiedCount === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">
                    Transactions are present, but classification is still pending. Review labels to unlock smarter recommendations.
                  </p>
                ) : (
                  <>
                    {recommendationAction === "accepted" ? (
                      <p className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
                        You&apos;ve acknowledged this recommendation for the current period.
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-700">
                      In {categoryFocus}, {focusedUselessRows.length} of {focusedClassifiedCount} classified transactions were marked useless this period.
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      Useless spend estimate: INR {focusedUselessSpend.toFixed(2)}.
                      {focusedTopMerchant ? ` Highest repeat merchant: ${focusedTopMerchant}.` : ""}
                    </p>
                    <p className="mt-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                      Recommendation: Try setting a weekly cap at INR {Math.max(0, focusedUselessSpend * 0.75).toFixed(0)} for {categoryFocus.toLowerCase()} to reduce wasteful spend without over-correcting.
                    </p>
                    {focusedTopReason ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Example rationale from recent AI reviews: {focusedTopReason}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <Link
                        className="font-medium text-teal-800 underline"
                        href={`/transactions?category=${encodeURIComponent(categoryFocus)}&from=${overviewStart
                          .toISOString()
                          .slice(0, 10)}&to=${overviewEnd.toISOString().slice(0, 10)}`}
                      >
                        Inspect filtered transactions
                      </Link>
                      <Link
                        className="font-medium text-teal-800 underline"
                        href="/transactions"
                      >
                        Review all classifications
                      </Link>
                      {recommendationAction !== "accepted" ? (
                        <form action={saveRecommendationAction}>
                          <input type="hidden" name="category" value={categoryFocus.toLowerCase()} />
                          <input type="hidden" name="periodKey" value={periodKey} />
                          <input type="hidden" name="action" value="accepted" />
                          <button
                            type="submit"
                            className="font-medium text-green-700 underline hover:text-green-900"
                          >
                            Accept
                          </button>
                        </form>
                      ) : null}
                      <form action={saveRecommendationAction}>
                        <input type="hidden" name="category" value={categoryFocus.toLowerCase()} />
                        <input type="hidden" name="periodKey" value={periodKey} />
                        <input type="hidden" name="action" value="dismissed" />
                        <button
                          type="submit"
                          className="font-medium text-slate-500 underline hover:text-slate-700"
                        >
                          {recommendationAction === "accepted" ? "Dismiss" : "Dismiss"}
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Payment message consent
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Status: {consent?.granted ? "Enabled" : "Disabled"}
        </p>

        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:gap-4">
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/onboarding/consent">
            Open onboarding consent step
          </Link>
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/settings/privacy">
            Manage in privacy settings
          </Link>
        </div>
      </section>

      {/* Budget utilization snapshot */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Budget utilization — {dashboardMonth}
          </h2>
          <Link className="text-xs font-medium text-teal-700 hover:text-teal-900" href="/budgets">
            Manage budgets →
          </Link>
        </div>

        {dashboardBudgetList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No budgets set for this month.{" "}
            <Link className="font-medium text-teal-700 underline hover:text-teal-900" href="/budgets">
              Add your first budget
            </Link>{" "}
            to start tracking spend limits.
          </p>
        ) : (
          <>
            {dashboardAlerts.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {dashboardAlerts.map((alert) => (
                  <li
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                    key={alert.id}
                  >
                    <p>{alert.message}</p>
                    {(() => {
                      const guidance = dashboardAlertGuidanceById.get(alert.id);
                      if (!guidance) return null;

                      return (
                        <details className="mt-2 rounded-md border border-rose-100 bg-white/70 px-2 py-1.5 text-xs text-slate-700">
                          <summary className="cursor-pointer font-medium text-rose-900">
                            View details and actions
                          </summary>
                          <p className="mt-1">
                            Category: <span className="font-medium capitalize">{guidance.categoryLabel}</span> • Status: {guidance.categoryStatus}
                          </p>
                          <p className="mt-1">
                            Remaining amount: INR {guidance.remainingAmount.toFixed(2)} • Utilization: {guidance.percentUsed}%
                          </p>
                          <ul className="mt-1 space-y-1">
                            {guidance.recommendedActions.map((action) => (
                              <li key={action}>- {action}</li>
                            ))}
                          </ul>
                        </details>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex flex-col gap-4">
              {dashboardUtilization.map((u) => {
                const barColor = u.isOver
                  ? "bg-red-500"
                  : u.isNearLimit
                    ? "bg-amber-400"
                    : "bg-teal-500";
                return (
                  <div key={u.budget.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-slate-900">{u.budget.category}</span>
                      <span className={u.isOver ? "font-semibold text-red-700" : u.isNearLimit ? "font-semibold text-amber-700" : "text-slate-600"}>
                        {u.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${barColor}`}
                        style={{ width: `${Math.min(u.pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>INR {u.spent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent</span>
                      <span>of INR {Number(u.budget.amount_limit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {u.isOver ? (
                      <p className="text-xs font-medium text-red-700">Over budget</p>
                    ) : u.isNearLimit ? (
                      <p className="text-xs font-medium text-amber-700">Approaching limit</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-200/75 bg-emerald-50/55 p-6 shadow-sm shadow-emerald-900/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-emerald-950">Savings goals snapshot</h2>
          <Link className="text-xs font-medium text-emerald-800 hover:text-emerald-900" href="/goals">
            Open goals →
          </Link>
        </div>

        {dashboardGoalProgress.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No savings goals yet. Add one to track progress.</p>
        ) : (
          <>
            {dashboardMilestones.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {dashboardMilestones.map((row) => (
                  <li
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900"
                    key={row.id}
                  >
                    {row.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                Total: <span className="font-semibold text-slate-900">{dashboardGoalSummary.totalGoals}</span>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                Completed: <span className="font-semibold text-slate-900">{dashboardGoalSummary.completedGoals}</span>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                Avg progress: <span className="font-semibold text-slate-900">{dashboardGoalSummary.avgProgress}%</span>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                Due soon: <span className="font-semibold text-slate-900">{dashboardGoalSummary.dueSoonCount}</span>
              </div>
            </div>

            <ul className="mt-3 space-y-2">
              {dashboardGoalProgress.slice(0, 3).map((row) => (
                <li key={row.goal.id} className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{row.goal.name}</span>
                    <span className="text-slate-600">{row.percent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.percent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-indigo-200/75 bg-indigo-50/55 p-6 shadow-sm shadow-indigo-900/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-950">
              Habit trend insights</h2>
            <p className="mt-2 text-sm text-indigo-900/80">
              Personalized from your own classified history ({habitInsights.periodLabel}).
            </p>
          </div>
          <span className="rounded-full bg-indigo-200/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-950">
            {habitInsights.sampleSize} classified
          </span>
        </div>

        {insightError ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not generate trend insights right now. Retry shortly.
          </p>
        ) : !habitInsights.isSufficientHistory ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            More classified transactions are needed before trend insights can be generated. Keep reviewing AI labels to build reliable summaries.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {habitInsights.insights.map((insight) => (
              <li className="rounded-lg border border-indigo-200 bg-white p-4" key={insight.id}>
                <h3 className="text-sm font-semibold text-slate-900">{insight.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{insight.text}</p>
                <p className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-900">
                  Action: {insight.impact}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-6 shadow-sm shadow-amber-900/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-amber-950">
              Uncategorized transaction queue
            </h2>
            <p className="mt-2 text-sm text-amber-900/80">
              Categorize new transactions so reports and spending insights stay accurate.
            </p>
          </div>
          <span className="rounded-full bg-amber-200/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-950">
            {uncategorizedTransactions.length} pending
          </span>
        </div>

        {queueError ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not load uncategorized transactions yet. Try again shortly.
          </p>
        ) : uncategorizedTransactions.length === 0 ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            All caught up. No uncategorized transactions right now.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {uncategorizedTransactions.map((transaction) => (
              <li
                className="rounded-lg border border-amber-200 bg-white p-4"
                key={transaction.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {transaction.merchant}
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    INR {transaction.amount.toFixed(2)}
                  </p>
                </div>

                <p className="mt-1 text-xs text-slate-600">
                  {new Date(transaction.date).toLocaleString()} • {transaction.source.toUpperCase()}
                  {transaction.reference ? ` • Ref ${transaction.reference}` : ""}
                </p>

                <p className="mt-1 text-xs text-slate-600">
                  AI: {transaction.ai_classification ?? "pending"}
                  {transaction.ai_reason ? ` • ${transaction.ai_reason}` : ""} • state=
                  {transaction.ai_review_state}
                </p>

                <form action={assignTransactionCategory} className="mt-3 flex flex-wrap items-center gap-2">
                  <input name="transactionId" type="hidden" value={transaction.id} />
                  <label className="sr-only" htmlFor={`category-${transaction.id}`}>
                    Category
                  </label>
                  <input
                    className="min-w-44 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    id={`category-${transaction.id}`}
                    list={`category-suggestions-${transaction.id}`}
                    maxLength={40}
                    minLength={2}
                    name="category"
                    placeholder="Assign a category"
                    required
                  />
                  <datalist id={`category-suggestions-${transaction.id}`}>
                    {suggestedCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                  <button
                    className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
                    type="submit"
                  >
                    Save category
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Transaction edits and bulk actions
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Select one or more rows for bulk categorization, or edit transaction details inline.
              {categoryFocus
                ? ` Showing only ${categoryFocus} rows due to category focus.`
                : ""}
            </p>
          </div>
        </div>

        <form action={bulkAssignTransactionCategory} className="mt-4 flex flex-wrap items-center gap-2" id="bulk-category-form">
          <input
            className="min-w-44 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            list="bulk-category-suggestions"
            maxLength={40}
            minLength={2}
            name="category"
            placeholder="Bulk category for selected rows"
            required
          />
          <datalist id="bulk-category-suggestions">
            {suggestedCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            type="submit"
          >
            Apply to selected
          </button>
        </form>

        {recentError ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not load recent transactions for editing. Retry shortly.
          </p>
        ) : transactionRows.length === 0 ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            No transactions captured yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {transactionRows.map((transaction) => (
              <li className="rounded-lg border border-slate-200 bg-slate-50/40 p-4" key={transaction.id}>
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      form="bulk-category-form"
                      name="transactionIds"
                      type="checkbox"
                      value={transaction.id}
                    />
                    Select
                  </label>
                  <p className="text-xs text-slate-600">ID: {transaction.id.slice(0, 8)}</p>
                </div>

                <form action={editTransactionDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input name="transactionId" type="hidden" value={transaction.id} />

                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={transaction.merchant}
                    maxLength={120}
                    minLength={2}
                    name="merchant"
                    placeholder="Merchant"
                    required
                  />

                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={transaction.amount.toFixed(2)}
                    min="0.01"
                    name="amount"
                    placeholder="Amount"
                    required
                    step="0.01"
                    type="number"
                  />

                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={transaction.source}
                    name="source"
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="wallet">Wallet</option>
                    <option value="bank">Bank</option>
                    <option value="unknown">Unknown</option>
                  </select>

                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={transaction.reference ?? ""}
                    maxLength={80}
                    name="reference"
                    placeholder="Reference"
                  />

                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={new Date(transaction.date).toISOString().slice(0, 16)}
                    name="date"
                    required
                    type="datetime-local"
                  />

                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    defaultValue={transaction.category ?? ""}
                    list={`edit-category-suggestions-${transaction.id}`}
                    maxLength={40}
                    name="category"
                    placeholder="Category (optional)"
                  />
                  <datalist id={`edit-category-suggestions-${transaction.id}`}>
                    {suggestedCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>

                  <div className="sm:col-span-2">
                    <button
                      className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-800"
                      type="submit"
                    >
                      Save transaction edits
                    </button>
                  </div>
                </form>

                <form action={assignTransactionCategory} className="mt-3 flex flex-wrap items-center gap-2">
                  <input name="transactionId" type="hidden" value={transaction.id} />
                  <input
                    className="min-w-44 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    list={`quick-category-suggestions-${transaction.id}`}
                    maxLength={40}
                    minLength={2}
                    name="category"
                    placeholder="Quick category update"
                    required
                  />
                  <datalist id={`quick-category-suggestions-${transaction.id}`}>
                    {suggestedCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                  <button
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    type="submit"
                  >
                    Quick category save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
