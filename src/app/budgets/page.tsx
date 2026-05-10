import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteBudget,
  saveBudgetAlertPreferences,
  upsertBudget,
} from "@/app/budgets/actions";
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
import { computeBudgetUtilization, type BudgetUtilization } from "@/lib/budgets/utilization";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BudgetsPageProps = {
  searchParams: Promise<{ message?: string; error?: string; edit?: string }>;
};

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const params = await searchParams;
  const message = params.message ?? null;
  const error = params.error ?? null;
  const editId = params.edit ?? null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const thisMonth = currentMonthKey();
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = currentMonthKey(nextMonthDate);

  const { data: budgets, error: fetchError } = await supabase
    .from("budgets")
    .select("id,category,month,amount_limit,created_at,updated_at")
    .eq("user_id", user.id)
    .order("month", { ascending: false })
    .order("category", { ascending: true })
    .returns<Budget[]>();

  const budgetList = budgets ?? [];

  // Compute utilization for current month budgets
  const thisMonthBudgets = budgetList.filter((b) => b.month === thisMonth);
  const utilization: BudgetUtilization[] = fetchError
    ? []
    : await computeBudgetUtilization(supabase, user.id, thisMonth, thisMonthBudgets);

  const alertPreference = await getOrCreateBudgetAlertPreference(supabase, user.id);
  await evaluateBudgetAlerts({
    supabase,
    userId: user.id,
    month: thisMonth,
    utilization,
    preference: alertPreference,
  });

  const { data: alertRows } = await supabase
    .from("budget_alerts")
    .select("id,user_id,budget_id,month,threshold,spent_amount,budget_limit,channels,message,created_at")
    .eq("user_id", user.id)
    .eq("month", thisMonth)
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<BudgetAlertRow[]>();

  const recentAlerts = (alertRows ?? []).filter((row) => row.channels?.in_app !== false);

  const budgetById = new Map(budgetList.map((budget) => [budget.id, budget]));
  const monthRange = monthBoundsFromKey(thisMonth);
  const { data: monthTransactions } = await supabase
    .from("transactions")
    .select("amount,merchant,category,ai_classification")
    .eq("user_id", user.id)
    .gte("date", monthRange.start.toISOString())
    .lt("date", monthRange.end.toISOString())
    .returns<AlertContextTransaction[]>();

  const transactionContext = monthTransactions ?? [];
  const alertGuidanceById = new Map(
    recentAlerts.map((alert) => {
      const budget = budgetById.get(alert.budget_id);
      return [
        alert.id,
        buildBudgetAlertGuidance({
          alert,
          budgetCategory: budget?.category ?? null,
          categoryTransactions: transactionContext,
        }),
      ] as const;
    }),
  );

  const utilizationMap = new Map<string, BudgetUtilization>(
    utilization.map((u) => [u.budget.id, u]),
  );

  const editBudget = editId ? budgetList.find((b) => b.id === editId) ?? null : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Budget Planning</h1>
          <Link
            className="text-sm font-medium text-teal-700 hover:text-teal-900"
            href="/dashboard"
          >
            ← Dashboard
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          Set monthly spending limits per category. Zeph will track utilization and alert you before you overspend.
        </p>
      </header>

      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}
      {fetchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load budgets right now. Please refresh.
        </div>
      ) : null}

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-amber-950">Budget alert preferences</h2>
        <p className="mt-2 text-sm text-amber-900/80">
          Configure threshold and channel settings for proactive budget warnings.
        </p>

        <form action={saveBudgetAlertPreferences} className="mt-4 space-y-3">
          <input type="hidden" name="returnTo" value="/budgets" />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                defaultChecked={alertPreference.alert_75_enabled}
                name="alert75Enabled"
                type="checkbox"
              />
              Alert at 75%
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                defaultChecked={alertPreference.alert_100_enabled}
                name="alert100Enabled"
                type="checkbox"
              />
              Alert at 100%
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                defaultChecked={alertPreference.in_app_enabled}
                name="inAppEnabled"
                type="checkbox"
              />
              In-app alerts
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                defaultChecked={alertPreference.push_enabled}
                name="pushEnabled"
                type="checkbox"
              />
              Push alerts
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
              <input
                defaultChecked={alertPreference.email_enabled}
                name="emailEnabled"
                type="checkbox"
              />
              Email alerts (optional)
            </label>
          </div>

          <button
            className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
            type="submit"
          >
            Save alert preferences
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-rose-950">Recent budget alerts</h2>

        {recentAlerts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No alerts triggered for {thisMonth} yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentAlerts.map((alert) => (
              <li key={alert.id} className="rounded-md border border-rose-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">{alert.message}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Threshold: {alert.threshold}% • Spent: INR {Number(alert.spent_amount).toFixed(2)} • Limit: INR {Number(alert.budget_limit).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Triggered at {new Date(alert.created_at).toLocaleString()}
                </p>

                {(() => {
                  const guidance = alertGuidanceById.get(alert.id);
                  if (!guidance) return null;

                  return (
                    <details className="mt-2 rounded-md border border-rose-100 bg-rose-50/40 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-rose-900">
                        View corrective guidance
                      </summary>
                      <p className="mt-2 text-xs text-slate-700">
                        Category: <span className="font-medium capitalize">{guidance.categoryLabel}</span> • Status: {guidance.categoryStatus}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">
                        Remaining amount: INR {guidance.remainingAmount.toFixed(2)} • Utilization: {guidance.percentUsed}%
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-700">
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
        )}
      </section>

      {/* Create / Edit form */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          {editBudget ? "Edit budget" : "Add a budget"}
        </h2>
        <form action={upsertBudget} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="returnTo" value="/budgets" />
          {editBudget ? (
            // When editing, hidden field carries the upsert key values
            <>
              <input type="hidden" name="category" value={editBudget.category} />
              <input type="hidden" name="month" value={editBudget.month} />
            </>
          ) : null}

          {!editBudget ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="budget-category">
                Category
              </label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                id="budget-category"
                name="category"
                placeholder="e.g. Food, Entertainment, Travel"
                required
                type="text"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-slate-700">Category</p>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                {editBudget.category}
              </p>
            </div>
          )}

          {!editBudget ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="budget-month">
                Month
              </label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                defaultValue={thisMonth}
                id="budget-month"
                name="month"
                max={nextMonth}
                min="2020-01"
                required
                type="month"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-slate-700">Month</p>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                {editBudget.month}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="budget-limit">
              Monthly limit (INR)
            </label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              defaultValue={editBudget ? editBudget.amount_limit : ""}
              id="budget-limit"
              min="1"
              name="amountLimit"
              placeholder="e.g. 5000"
              required
              step="0.01"
              type="number"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="rounded-md bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              type="submit"
            >
              {editBudget ? "Save changes" : "Add budget"}
            </button>
            {editBudget ? (
              <Link
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
                href="/budgets"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {/* Budget list */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Your budgets</h2>

        {budgetList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No budgets yet. Add your first budget above to start tracking.
          </p>
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-slate-100">
            {budgetList.map((budget) => {
              const util = utilizationMap.get(budget.id) ?? null;
              const isCurrentMonth = budget.month === thisMonth;
              const barColor = util
                ? util.isOver
                  ? "bg-red-500"
                  : util.isNearLimit
                    ? "bg-amber-400"
                    : "bg-teal-500"
                : "bg-slate-200";
              const barWidth = util ? Math.min(util.pct, 100) : 0;

              return (
                <div key={budget.id} className="flex flex-col gap-2 py-4">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium capitalize text-slate-900">
                        {budget.category}
                        {isCurrentMonth ? (
                          <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                            Current month
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500">{budget.month}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-slate-900">
                        Limit: INR {Number(budget.amount_limit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <Link
                        className="text-xs font-medium text-teal-700 hover:text-teal-900"
                        href={`/budgets?edit=${budget.id}`}
                      >
                        Edit
                      </Link>
                      <form action={deleteBudget}>
                        <input type="hidden" name="budgetId" value={budget.id} />
                        <input type="hidden" name="returnTo" value="/budgets" />
                        <button
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                          type="submit"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  {isCurrentMonth && util ? (
                    <div className="flex flex-col gap-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full transition-all ${barColor}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          Spent: INR {util.spent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {" "}
                          <span className={util.isOver ? "font-semibold text-red-700" : util.isNearLimit ? "font-semibold text-amber-700" : ""}>
                            ({util.pct}%)
                          </span>
                        </span>
                        <span>
                          {util.isOver
                            ? <span className="font-semibold text-red-700">Over budget by INR {(util.spent - Number(budget.amount_limit)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span>Remaining: INR {util.remaining.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          }
                        </span>
                      </div>
                      {util.isNearLimit && !util.isOver ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                          You&apos;ve used {util.pct}% of this budget — consider slowing spend before the month ends.
                        </p>
                      ) : null}
                      {util.isOver ? (
                        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800">
                          Budget exceeded. Review your {budget.category} transactions to understand the overspend.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
