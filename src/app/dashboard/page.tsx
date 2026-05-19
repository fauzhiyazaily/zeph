import Link from "next/link";
import { redirect } from "next/navigation";
import {
  assignTransactionCategory,
  bulkAssignTransactionCategory,
  createManualExpense,
  deleteFinancialDocument,
  editTransactionDetails,
  saveRecommendationAction,
} from "@/app/dashboard/actions";
import { BankStatementUpload } from "@/app/dashboard/bank-statement-upload";
import { AppShell } from "@/app/components/app-shell";
import { SpendPieChart } from "@/app/dashboard/spend-pie-chart";
import { DashboardStatusBanner } from "@/app/dashboard/status-banner";
import { WeeklyExpenseChart } from "@/app/dashboard/weekly-expense-chart";
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
import type { BankStatementAnalysis } from "@/lib/ingestion/bank-statement-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ArrowUpRight, Bolt, Brain, CircleDollarSign, Flag, Sparkles, Wallet } from "lucide-react";

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

type FinancialDocumentDashboardRow = {
  id: string;
  file_name: string;
  parse_status: "processing" | "completed" | "failed";
  parse_error: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number_masked: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  transaction_count: number;
  imported_debit_count: number;
  total_credits: number;
  total_debits: number;
  opening_balance: number | null;
  closing_balance: number | null;
  processed_at: string | null;
  created_at: string;
  extracted_summary: BankStatementAnalysis | null;
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

// Hex equivalents for recharts Cell fill (Tailwind class strings are not valid SVG fill values)
const chartPalette: Record<string, string> = {
  Food: "#fbbf24",
  Transport: "#38bdf8",
  Groceries: "#34d399",
  Bills: "#818cf8",
  Shopping: "#fb7185",
  Health: "#a3e635",
  Entertainment: "#e879f9",
  Uncategorized: "#94a3b8",
  Other: "#a1a1aa",
};

type DashboardPageProps = {
  searchParams: Promise<{
    period?: string;
    categoryFocus?: string;
    message?: string;
    error?: string;
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
  const feedbackMessage = (params.message ?? "").trim();
  const feedbackError = (params.error ?? "").trim();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const consent = getMessageReadingConsent(user);
  const { data: financialDocuments, error: financialDocumentsError } = await supabase
    .from("financial_documents")
    .select(
      "id,file_name,parse_status,parse_error,bank_name,account_holder_name,account_number_masked,statement_period_start,statement_period_end,transaction_count,imported_debit_count,total_credits,total_debits,opening_balance,closing_balance,processed_at,created_at,extracted_summary",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<FinancialDocumentDashboardRow[]>();

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

  const selectedPeriodRows = (overviewRows ?? []).filter((row) => {
    const at = new Date(row.date);
    return at >= overviewStart && at < overviewEnd;
  });

  let chartWindowStart = overviewStart;
  let chartWindowEnd = overviewEnd;
  let chartWindowLabel = period === "this" ? "This week" : "Last week";
  let chartRows = selectedPeriodRows;

  // If the selected 7-day window has no spend data, fall back to last 30 days.
  if (chartRows.length === 0) {
    const fallbackBounds = periodBounds(30, new Date(), 0);
    const { data: fallbackRows } = await supabase
      .from("transactions")
      .select("amount,category,date")
      .eq("user_id", user.id)
      .gte("date", fallbackBounds.start.toISOString())
      .lt("date", fallbackBounds.end.toISOString())
      .returns<SpendRecord[]>();

    const recentRows = (fallbackRows ?? []).filter((row) => {
      const at = new Date(row.date);
      return at >= fallbackBounds.start && at < fallbackBounds.end;
    });

    if (recentRows.length > 0) {
      chartRows = recentRows;
      chartWindowStart = fallbackBounds.start;
      chartWindowEnd = fallbackBounds.end;
      chartWindowLabel = "Last 30 days";
    }
  }

  const breakdown = buildCategoryBreakdown(chartRows, chartWindowStart, chartWindowEnd);
  const totalPeriodSpend = breakdown.reduce((sum, row) => sum + row.amount, 0);

  const pieMonth = currentMonthKey();
  const pieMonthRange = monthBoundsFromKey(pieMonth);
  const { data: pieRows } = await supabase
    .from("transactions")
    .select("amount,category,date")
    .eq("user_id", user.id)
    .gte("date", pieMonthRange.start.toISOString())
    .lt("date", pieMonthRange.end.toISOString())
    .returns<SpendRecord[]>();

  const pieBreakdownCurrentMonth = buildCategoryBreakdown(
    pieRows ?? [],
    pieMonthRange.start,
    pieMonthRange.end,
  );
  const pieBreakdown = pieBreakdownCurrentMonth.length > 0 ? pieBreakdownCurrentMonth : breakdown;

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

  const monthSpend = dashboardTransactionContext.reduce((sum, row) => sum + Number(row.amount), 0);
  const monthBudgetLimitTotal = dashboardBudgetList.reduce(
    (sum, row) => sum + Number(row.amount_limit),
    0,
  );
  const budgetUtilizationRate = monthBudgetLimitTotal > 0
    ? Math.round((monthSpend / monthBudgetLimitTotal) * 100)
    : 0;
  const projectedIncome = Math.max(monthSpend * 1.25, monthBudgetLimitTotal * 1.08, 12000);
  const projectedSavings = Math.max(projectedIncome - monthSpend, 0);
  const savingsProgressPct = projectedIncome > 0
    ? Math.round((projectedSavings / projectedIncome) * 100)
    : 0;

  const weeklySpendMap = new Map<string, { day: string; amount: number }>();
  const trendWindowEnd = chartWindowEnd;
  const trendWindowStart = new Date(trendWindowEnd);
  trendWindowStart.setUTCDate(trendWindowStart.getUTCDate() - 7);
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(trendWindowStart);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    weeklySpendMap.set(key, {
      day: date.toLocaleDateString("en-IN", { weekday: "short" }),
      amount: 0,
    });
  }

  chartRows.forEach((row) => {
    const date = new Date(row.date);
    if (date < trendWindowStart || date >= trendWindowEnd) {
      return;
    }
    const key = date.toISOString().slice(0, 10);
    const existing = weeklySpendMap.get(key);
    if (!existing) {
      return;
    }
    existing.amount += Number(row.amount);
  });

  const weeklyTrendData = Array.from(weeklySpendMap.values());

  const quickAnalytics = [
    {
      label: "Budget health",
      value: `${budgetUtilizationRate}% utilized`,
      icon: CircleDollarSign,
    },
    {
      label: "Savings progress",
      value: `${savingsProgressPct}% this month`,
      icon: Flag,
    },
    {
      label: "AI coverage",
      value: `${habitInsights.sampleSize} classified`,
      icon: Brain,
    },
  ];

  return (
    <AppShell active="/dashboard">
    <main className="app-content soft-fade-in relative mx-auto w-full max-w-[1600px] flex flex-col gap-7 px-4 py-5 lg:px-6 lg:py-6">
      <DashboardStatusBanner />

      {feedbackMessage ? (
        <p className="rounded-xl border border-emerald-300/40 bg-emerald-950/35 px-4 py-3 text-sm text-emerald-100">
          {feedbackMessage}
        </p>
      ) : null}
      {feedbackError ? (
        <p className="rounded-xl border border-rose-300/40 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
          {feedbackError}
        </p>
      ) : null}

      <header className="glass-card premium-hero rounded-2xl p-6 sm:p-7">
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                Financial intelligence platform
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
                Welcome back to Zeph
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {" \u2022 "}
                {user.email}
              </p>
            </div>
            <div className="inline-flex shrink-0 items-center gap-3 rounded-2xl border border-indigo-300/35 bg-slate-950/40 px-4 py-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-sm font-semibold text-white">
                {(user.email ?? "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 overflow-hidden">
                <p className="text-xs text-slate-300">Active profile</p>
                <p className="truncate text-sm font-semibold text-slate-100">Personal workspace</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="min-h-[5.5rem] rounded-2xl border border-slate-700/70 bg-slate-950/35 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Current balance target</p>
              <p className="mt-3 text-3xl font-bold text-slate-50">
                INR {projectedIncome.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </article>
            <article className="min-h-[5.5rem] rounded-2xl border border-slate-700/70 bg-slate-950/35 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Monthly spending</p>
              <p className="mt-3 text-3xl font-bold text-slate-50">
                INR {monthSpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </article>
            <article className="min-h-[5.5rem] rounded-2xl border border-slate-700/70 bg-slate-950/35 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Savings progress</p>
              <p className="mt-3 text-3xl font-bold text-emerald-300">{savingsProgressPct}%</p>
            </article>
            <article className="min-h-[5.5rem] rounded-2xl border border-slate-700/70 bg-slate-950/35 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Projected savings</p>
              <p className="mt-3 text-3xl font-bold text-cyan-300">
                INR {projectedSavings.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </article>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickAnalytics.map((chip) => {
              const Icon = chip.icon;
              return (
                <span key={chip.label} className="premium-chip inline-flex items-center gap-2">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{chip.label}</span>
                  <span className="text-sky-200">{chip.value}</span>
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-50">Quick actions</h2>
        <p className="mt-2 text-sm text-slate-300">
          Continue your workflow with high-signal controls and clean, focused navigation.
        </p>

        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          <li className="premium-action-card rounded-2xl p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-300">Explore</p>
            <Link className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100" href="/transactions">
              <Wallet aria-hidden="true" className="h-4 w-4" />
              Transaction history
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <p className="mt-2 text-xs text-slate-300">Review and refine transaction quality with full search.</p>
          </li>
          <li className="premium-action-card rounded-2xl p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-300">Optimize</p>
            <Link className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-indigo-200 hover:text-indigo-100" href="/budgets">
              <CircleDollarSign aria-hidden="true" className="h-4 w-4" />
              Budget control center
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <p className="mt-2 text-xs text-slate-300">Track utilization and detect risk before limits are breached.</p>
          </li>
          <li className="premium-action-card rounded-2xl p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-300">Accelerate</p>
            <Link className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-violet-200 hover:text-violet-100" href="/goals">
              <Flag aria-hidden="true" className="h-4 w-4" />
              Goals and milestones
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <p className="mt-2 text-xs text-slate-300">Maintain momentum and convert intent into measurable savings.</p>
          </li>
        </ol>
      </section>

      <BankStatementUpload />

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Imported statement intelligence</h2>
            <p className="mt-2 text-sm text-slate-300">
              Recent uploaded statements feed debit transactions into Zeph while preserving full credit, balance, and recurring-payment context in a separate secure document layer.
            </p>
          </div>
          <Link
            className="text-sm font-medium text-cyan-200 hover:text-cyan-100"
            href="/transactions?source=bank"
          >
            Open bank-linked transactions
          </Link>
        </div>

        {financialDocumentsError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            Could not load uploaded statement summaries right now.
          </p>
        ) : (financialDocuments?.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-md border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
            No bank statements uploaded yet. Upload one to unlock document-driven income, balance, and recurring payment insights.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {(financialDocuments ?? []).map((document) => {
              const analysis = document.extracted_summary;
              const savingsRateLabel = analysis?.savingsRate === null || analysis?.savingsRate === undefined
                ? "N/A"
                : `${analysis.savingsRate}%`;

              return (
                <article
                  className="rounded-[1.6rem] border border-slate-300/30 bg-slate-950/28 p-5 shadow-[0_22px_42px_-30px_rgba(15,23,42,0.9)]"
                  key={document.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                          {document.parse_status}
                        </span>
                        {document.bank_name ? (
                          <span className="text-xs font-medium text-slate-300">{document.bank_name}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-slate-100">{document.file_name}</h3>
                      <p className="mt-2 text-sm text-slate-300">
                        {document.account_holder_name ?? "Account holder not detected"}
                        {document.account_number_masked ? ` • ${document.account_number_masked}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {document.statement_period_start
                          ? `${new Date(document.statement_period_start).toLocaleDateString("en-IN")} to ${new Date(document.statement_period_end ?? document.statement_period_start).toLocaleDateString("en-IN")}`
                          : `Uploaded ${new Date(document.created_at).toLocaleString("en-IN")}`}
                      </p>
                    </div>

                    <form action={deleteFinancialDocument}>
                      <input type="hidden" name="documentId" value={document.id} />
                      <input type="hidden" name="returnTo" value="/dashboard" />
                      <button
                        className="rounded-xl border border-rose-300/35 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-950/35"
                        type="submit"
                      >
                        Delete statement
                      </button>
                    </form>
                    <Link
                      className="rounded-xl border border-cyan-300/35 bg-cyan-950/20 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-950/35"
                      href={`/statements/${document.id}`}
                    >
                      Open details
                    </Link>
                  </div>

                  {document.parse_status === "failed" ? (
                    <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-950/25 px-3 py-2 text-sm text-rose-100">
                      {document.parse_error ?? "Statement parsing failed."}
                    </p>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Credits</p>
                      <p className="mt-2 text-xl font-semibold text-emerald-200">INR {Number(document.total_credits).toFixed(0)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Debits imported</p>
                      <p className="mt-2 text-xl font-semibold text-cyan-200">{document.imported_debit_count}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Savings rate</p>
                      <p className="mt-2 text-xl font-semibold text-slate-100">{savingsRateLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Health score</p>
                      <p className="mt-2 text-xl font-semibold text-violet-200">{analysis?.healthScore ?? "--"}</p>
                    </div>
                  </div>

                  {analysis ? (
                    <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-2xl border border-slate-300/30 bg-slate-950/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Financial health summary</p>
                        <p className="mt-3 text-sm text-slate-200">{analysis.summary}</p>
                        <p className="mt-3 inline-flex rounded-full border border-violet-300/35 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-100">
                          {analysis.financialHealth} • {analysis.balanceTrend} balance trend
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-300/25 bg-slate-950/30 p-3 text-sm text-slate-200">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Top spend categories</p>
                            <ul className="mt-2 space-y-2">
                              {analysis.topCategories.length === 0 ? (
                                <li className="text-slate-400">No debit categories inferred yet.</li>
                              ) : analysis.topCategories.map((row) => (
                                <li className="flex items-center justify-between gap-3" key={row.category}>
                                  <span>{row.category}</span>
                                  <span className="font-semibold text-slate-100">INR {row.amount.toFixed(0)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-xl border border-slate-300/25 bg-slate-950/30 p-3 text-sm text-slate-200">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Recurring payments</p>
                            <ul className="mt-2 space-y-2">
                              {analysis.recurringPayments.length === 0 ? (
                                <li className="text-slate-400">No recurring payment pattern detected yet.</li>
                              ) : analysis.recurringPayments.map((row) => (
                                <li key={`${row.description}-${row.amount}`}>
                                  <p className="font-medium text-slate-100">{row.description}</p>
                                  <p className="text-xs text-slate-300">{row.occurrences} occurrences • INR {row.amount.toFixed(0)}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-300/30 bg-slate-950/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Risk and recommendations</p>
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Risk indicators</p>
                            <ul className="mt-2 space-y-2 text-sm text-slate-200">
                              {analysis.riskIndicators.length === 0 ? (
                                <li className="rounded-xl border border-emerald-300/30 bg-emerald-950/20 px-3 py-2 text-emerald-100">
                                  No immediate risk indicators were detected from this statement.
                                </li>
                              ) : analysis.riskIndicators.map((item) => (
                                <li className="rounded-xl border border-rose-300/30 bg-rose-950/20 px-3 py-2" key={item}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Recommendations</p>
                            <ul className="mt-2 space-y-2 text-sm text-slate-200">
                              {analysis.recommendations.map((item) => (
                                <li className="rounded-xl border border-cyan-300/25 bg-cyan-950/20 px-3 py-2" key={item}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Dashboard intelligence</h2>
            <p className="mt-2 text-sm text-slate-300">
              Live monthly spending, balance runway, utilization, and weekly trajectory.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-950/45 px-3 py-1 text-xs font-semibold text-indigo-100">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            AI-ready analytics
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Income vs expenses</p>
            <div className="mt-3 space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>Projected inflow</span>
                  <span>INR {projectedIncome.toFixed(0)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400" style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>Expenses</span>
                  <span>INR {monthSpend.toFixed(0)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-rose-400 to-orange-300"
                    style={{ width: `${Math.min(Math.round((monthSpend / projectedIncome) * 100), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Budget utilization</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{budgetUtilizationRate}%</p>
            <p className="mt-1 text-xs text-slate-300">
              INR {monthSpend.toFixed(0)} spent of INR {monthBudgetLimitTotal.toFixed(0)} allocated
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-violet-400 via-sky-400 to-cyan-300"
                style={{ width: `${Math.min(budgetUtilizationRate, 100)}%` }}
              />
            </div>
          </article>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
          <article className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Weekly expense trend</p>
              <span className="text-xs text-slate-300">{chartWindowLabel}</span>
            </div>
            <WeeklyExpenseChart data={weeklyTrendData} />
          </article>

          <article className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Spending categories (current month)</p>
            <SpendPieChart breakdown={pieBreakdown} wafflePalette={chartPalette} />
          </article>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Manual expense entry</h2>
            <p className="mt-2 text-sm text-slate-300">
              Add an expense manually and it will appear in history, budget tracking, goal insights,
              and AI review flows.
            </p>
          </div>
        </div>

        <form action={createManualExpense} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input name="returnTo" type="hidden" value="/dashboard" />

          <label className="relative text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">
              <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> Merchant
            </span>
            <input
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 text-sm"
              maxLength={120}
              minLength={2}
              name="merchant"
              placeholder="e.g. Metro Supermarket"
              required
            />
          </label>

          <label className="relative text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">
              <Bolt aria-hidden="true" className="h-3.5 w-3.5" /> Amount (INR)
            </span>
            <input
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 pl-7 text-sm text-slate-100"
              min="0.01"
              name="amount"
              placeholder="0.00"
              required
              step="0.01"
              type="number"
            />
            <span className="pointer-events-none absolute bottom-0 left-3 flex h-[2.375rem] items-center text-xs font-semibold text-slate-400">₹</span>
          </label>

          <label className="text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">Source</span>
            <select
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 text-sm"
              defaultValue="card"
              name="source"
            >
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="wallet">Wallet</option>
              <option value="bank">Bank</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>

          <label className="text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">Category</span>
            <input
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 text-sm"
              list="manual-category-suggestions"
              maxLength={40}
              name="category"
              placeholder="Smart suggestion: Food"
            />
            <datalist id="manual-category-suggestions">
              {suggestedCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <label className="text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">Reference</span>
            <input
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 text-sm"
              maxLength={80}
              name="reference"
              placeholder="Ref or note"
            />
          </label>

          <label className="text-sm text-slate-200">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-300">Date and time</span>
            <input
              className="w-full rounded-xl border border-indigo-300/30 bg-slate-950/35 px-3 py-2.5 text-sm"
              defaultValue={new Date().toISOString().slice(0, 16)}
              name="date"
              required
              type="datetime-local"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/35 transition hover:scale-[1.02] hover:shadow-cyan-900/35"
              type="submit"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" />
              Save manual expense
            </button>
          </div>
        </form>
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Overview spend by category</h2>
            <p className="mt-2 text-sm text-slate-300">
              Click any slice or category in the legend to focus on that category and see transaction context.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                period === "this"
                  ? "border-cyan-400/65 bg-cyan-500/25 text-cyan-100"
                  : "border-slate-500/55 bg-slate-900/65 text-slate-300"
              }`}
              href={`/dashboard${queryString({ period: "this", categoryFocus })}`}
            >
              This week
            </Link>
            <Link
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                period === "last"
                  ? "border-cyan-400/65 bg-cyan-500/25 text-cyan-100"
                  : "border-slate-500/55 bg-slate-900/65 text-slate-300"
              }`}
              href={`/dashboard${queryString({ period: "last", categoryFocus })}`}
            >
              Last week
            </Link>
          </div>
        </div>

        {overviewError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            Could not load overview chart data. Retry shortly.
          </p>
        ) : breakdown.length === 0 ? (
          <p className="mt-4 rounded-md border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
            No spend data available for this period yet.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-cyan-200">
              Period total: INR {totalPeriodSpend.toFixed(2)}
            </p>

            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {breakdown.map((row) => (
                <li key={row.category}>
                  <Link
                    className="flex items-center justify-between rounded-md border border-indigo-300/30 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 transition hover:bg-indigo-950/35"
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

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
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
              <div className="mt-4 rounded-lg border border-indigo-300/35 bg-slate-950/25 p-4">
                <h3 className="text-sm font-semibold text-slate-100">
                  Linked AI recommendation context
                </h3>

                {focusedRecommendationError ? (
                  <p className="mt-2 text-sm text-rose-200">
                    Could not load recommendation context right now.
                  </p>
                ) : recommendationAction === "dismissed" ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-300/80">Recommendation dismissed for this period.</p>
                    <form action={saveRecommendationAction}>
                      <input type="hidden" name="category" value={categoryFocus.toLowerCase()} />
                      <input type="hidden" name="periodKey" value={periodKey} />
                      <input type="hidden" name="action" value="accepted" />
                      <button
                        type="submit"
                        className="text-xs font-medium text-cyan-200 underline hover:text-cyan-100"
                      >
                        Show again
                      </button>
                    </form>
                  </div>
                ) : focusedRecommendationRows.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-200">
                    No transactions found for {categoryFocus} in this period yet.
                  </p>
                ) : focusedClassifiedCount === 0 ? (
                  <p className="mt-2 text-sm text-slate-200">
                    Transactions are present, but classification is still pending. Review labels to unlock smarter recommendations.
                  </p>
                ) : (
                  <>
                    {recommendationAction === "accepted" ? (
                      <p className="mt-2 rounded-md border border-emerald-300/40 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-100">
                        You&apos;ve acknowledged this recommendation for the current period.
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-200">
                      In {categoryFocus}, {focusedUselessRows.length} of {focusedClassifiedCount} classified transactions were marked useless this period.
                    </p>
                    <p className="mt-1 text-sm text-slate-200">
                      Useless spend estimate: INR {focusedUselessSpend.toFixed(2)}.
                      {focusedTopMerchant ? ` Highest repeat merchant: ${focusedTopMerchant}.` : ""}
                    </p>
                    <p className="mt-2 rounded-md border border-teal-300/35 bg-teal-950/30 px-3 py-2 text-xs font-medium text-teal-100">
                      Recommendation: Try setting a weekly cap at INR {Math.max(0, focusedUselessSpend * 0.75).toFixed(0)} for {categoryFocus.toLowerCase()} to reduce wasteful spend without over-correcting.
                    </p>
                    {focusedTopReason ? (
                      <p className="mt-2 text-xs text-slate-300/85">
                        Example rationale from recent AI reviews: {focusedTopReason}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <Link
                        className="font-medium text-cyan-200 underline"
                        href={`/transactions?category=${encodeURIComponent(categoryFocus)}&from=${overviewStart
                          .toISOString()
                          .slice(0, 10)}&to=${overviewEnd.toISOString().slice(0, 10)}`}
                      >
                        Inspect filtered transactions
                      </Link>
                      <Link
                        className="font-medium text-cyan-200 underline"
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
                            className="font-medium text-emerald-200 underline hover:text-emerald-100"
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
                          className="font-medium text-slate-300 underline hover:text-slate-100"
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

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-100">
          Payment message consent
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Status: {consent?.granted ? "Enabled" : "Disabled"}
        </p>

        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:gap-4">
          <Link className="font-medium text-cyan-200 hover:text-cyan-100" href="/onboarding/consent">
            Open onboarding consent step
          </Link>
          <Link className="font-medium text-cyan-200 hover:text-cyan-100" href="/settings/privacy">
            Manage in privacy settings
          </Link>
        </div>
      </section>

      {/* Budget utilization snapshot */}
      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">
            Budget utilization — {dashboardMonth}
          </h2>
          <Link className="text-xs font-medium text-cyan-200 hover:text-cyan-100" href="/budgets">
            Manage budgets →
          </Link>
        </div>

        {dashboardBudgetList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            No budgets set for this month.{" "}
            <Link className="font-medium text-cyan-200 underline hover:text-cyan-100" href="/budgets">
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
                    className="rounded-md border border-rose-300/40 bg-rose-950/28 px-3 py-2 text-sm text-rose-100"
                    key={alert.id}
                  >
                    <p>{alert.message}</p>
                    {(() => {
                      const guidance = dashboardAlertGuidanceById.get(alert.id);
                      if (!guidance) return null;

                      return (
                        <details className="mt-2 rounded-md border border-rose-300/35 bg-slate-950/35 px-2 py-1.5 text-xs text-slate-200">
                          <summary className="cursor-pointer font-medium text-rose-100">
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
                      <span className="font-medium capitalize text-slate-100">{u.budget.category}</span>
                      <span className={u.isOver ? "font-semibold text-rose-200" : u.isNearLimit ? "font-semibold text-amber-200" : "text-slate-200"}>
                        {u.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/70">
                      <div
                        className={`h-2 rounded-full ${barColor}`}
                        style={{ width: `${Math.min(u.pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-300/85">
                      <span>INR {u.spent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent</span>
                      <span>of INR {Number(u.budget.amount_limit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {u.isOver ? (
                      <p className="text-xs font-medium text-rose-200">Over budget</p>
                    ) : u.isNearLimit ? (
                      <p className="text-xs font-medium text-amber-200">Approaching limit</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-emerald-100">Savings goals snapshot</h2>
          <Link className="text-xs font-medium text-cyan-200 hover:text-cyan-100" href="/goals">
            Open goals →
          </Link>
        </div>

        {dashboardGoalProgress.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">No savings goals yet. Add one to track progress.</p>
        ) : (
          <>
            {dashboardMilestones.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {dashboardMilestones.map((row) => (
                  <li
                    className="rounded-md border border-emerald-300/35 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
                    key={row.id}
                  >
                    {row.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                Total: <span className="font-semibold text-slate-100">{dashboardGoalSummary.totalGoals}</span>
              </div>
              <div className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                Completed: <span className="font-semibold text-slate-100">{dashboardGoalSummary.completedGoals}</span>
              </div>
              <div className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                Avg progress: <span className="font-semibold text-slate-100">{dashboardGoalSummary.avgProgress}%</span>
              </div>
              <div className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                Due soon: <span className="font-semibold text-slate-100">{dashboardGoalSummary.dueSoonCount}</span>
              </div>
            </div>

            <ul className="mt-3 space-y-2">
              {dashboardGoalProgress.slice(0, 3).map((row) => (
                <li key={row.goal.id} className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-100">{row.goal.name}</span>
                    <span className="text-slate-300/85">{row.percent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800/70">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.percent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-100">
              Habit trend insights</h2>
            <p className="mt-2 text-sm text-indigo-200/90">
              Personalized from your own classified history ({habitInsights.periodLabel}).
            </p>
          </div>
          <span className="rounded-full border border-indigo-300/35 bg-indigo-950/35 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100">
            {habitInsights.sampleSize} classified
          </span>
        </div>

        {insightError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            Could not generate trend insights right now. Retry shortly.
          </p>
        ) : !habitInsights.isSufficientHistory ? (
          <p className="mt-4 rounded-md border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
            More classified transactions are needed before trend insights can be generated. Keep reviewing AI labels to build reliable summaries.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {habitInsights.insights.map((insight) => (
              <li className="rounded-lg border border-indigo-300/35 bg-slate-950/30 p-4" key={insight.id}>
                <h3 className="text-sm font-semibold text-slate-100">{insight.title}</h3>
                <p className="mt-1 text-sm text-slate-200">{insight.text}</p>
                <p className="mt-2 rounded-md border border-indigo-300/35 bg-indigo-950/30 px-3 py-2 text-xs font-medium text-indigo-100">
                  Action: {insight.impact}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-amber-100">
              Uncategorized transaction queue
            </h2>
            <p className="mt-2 text-sm text-amber-200/90">
              Categorize new transactions so reports and spending insights stay accurate.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/35 bg-amber-950/35 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
            {uncategorizedTransactions.length} pending
          </span>
        </div>

        {queueError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            Could not load uncategorized transactions yet. Try again shortly.
          </p>
        ) : uncategorizedTransactions.length === 0 ? (
          <p className="mt-4 rounded-md border border-emerald-300/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
            All caught up. No uncategorized transactions right now.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {uncategorizedTransactions.map((transaction) => (
              <li
                className="rounded-lg border border-amber-300/35 bg-slate-950/30 p-4"
                key={transaction.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">
                    {transaction.merchant}
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    INR {transaction.amount.toFixed(2)}
                  </p>
                </div>

                <p className="mt-1 text-xs text-slate-300/85">
                  {new Date(transaction.date).toLocaleString()} • {transaction.source.toUpperCase()}
                  {transaction.reference ? ` • Ref ${transaction.reference}` : ""}
                </p>

                <p className="mt-1 text-xs text-slate-300/85">
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
                    className="min-w-44 flex-1 rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
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
                    className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700"
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
            <h2 className="text-lg font-semibold text-slate-100">
              Transaction edits and bulk actions
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Select one or more rows for bulk categorization, or edit transaction details inline.
              {categoryFocus
                ? ` Showing only ${categoryFocus} rows due to category focus.`
                : ""}
            </p>
          </div>
        </div>

        <form action={bulkAssignTransactionCategory} className="mt-4 flex flex-wrap items-center gap-2" id="bulk-category-form">
          <input
            className="min-w-44 flex-1 rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
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
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            type="submit"
          >
            Apply to selected
          </button>
        </form>

        {recentError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            Could not load recent transactions for editing. Retry shortly.
          </p>
        ) : transactionRows.length === 0 ? (
          <p className="mt-4 rounded-md border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
            No transactions captured yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {transactionRows.map((transaction) => (
              <li className="rounded-lg border border-slate-300/30 bg-slate-950/30 p-4" key={transaction.id}>
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                    <input
                      className="h-4 w-4 rounded border-slate-400/60 text-cyan-300 focus:ring-cyan-500"
                      form="bulk-category-form"
                      name="transactionIds"
                      type="checkbox"
                      value={transaction.id}
                    />
                    Select
                  </label>
                  <p className="text-xs text-slate-300/85">ID: {transaction.id.slice(0, 8)}</p>
                </div>

                <form action={editTransactionDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input name="transactionId" type="hidden" value={transaction.id} />

                  <input
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
                    defaultValue={transaction.merchant}
                    maxLength={120}
                    minLength={2}
                    name="merchant"
                    placeholder="Merchant"
                    required
                  />

                  <input
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
                    defaultValue={transaction.amount.toFixed(2)}
                    min="0.01"
                    name="amount"
                    placeholder="Amount"
                    required
                    step="0.01"
                    type="number"
                  />

                  <select
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
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
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
                    defaultValue={transaction.reference ?? ""}
                    maxLength={80}
                    name="reference"
                    placeholder="Reference"
                  />

                  <input
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
                    defaultValue={new Date(transaction.date).toISOString().slice(0, 16)}
                    name="date"
                    required
                    type="datetime-local"
                  />

                  <input
                    className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
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
                    className="min-w-44 flex-1 rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
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
                    className="rounded-md border border-slate-300/40 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
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
    </AppShell>
  );
}
