import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileFinanceNav } from "@/app/components/mobile-finance-nav";
import { deleteGoal, saveGoal } from "@/app/goals/actions";
import { type Goal } from "@/lib/goals/goal-helpers";
import {
  evaluateGoalMilestones,
  type GoalMilestoneRow,
} from "@/lib/goals/milestones";
import { computeGoalProgress, summarizeGoalProgress } from "@/lib/goals/progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type GoalsPageProps = {
  searchParams: Promise<{ message?: string; error?: string; edit?: string }>;
};

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
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

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id,user_id,name,target_amount,current_amount,deadline,notes,created_at,updated_at")
    .eq("user_id", user.id)
    .order("deadline", { ascending: true })
    .returns<Goal[]>();

  const goalList = goals ?? [];
  const editingGoal = editId ? goalList.find((goal) => goal.id === editId) ?? null : null;
  const goalProgressRows = goalList.map((goal) => computeGoalProgress(goal));
  const goalSummary = summarizeGoalProgress(goalProgressRows);

  await evaluateGoalMilestones({
    supabase,
    userId: user.id,
    rows: goalProgressRows,
  });

  const { data: milestoneRows } = await supabase
    .from("goal_milestones")
    .select("id,user_id,goal_id,milestone,progress_percent,message,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<GoalMilestoneRow[]>();

  const milestones = milestoneRows ?? [];
  const celebrationRows = milestones.slice(0, 4);
  const goalNameById = new Map(goalList.map((goal) => [goal.id, goal.name]));

  return (
    <main className="finance-shell mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Savings Goals</h1>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className="text-sm font-medium text-cyan-200 hover:text-cyan-100"
              href="/goals/history"
            >
              Goal history
            </Link>
            <Link
              className="text-sm font-medium text-cyan-200 hover:text-cyan-100"
              href="/dashboard"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          Create and manage goal targets with deadlines to track meaningful savings milestones.
        </p>
      </header>

      {message ? (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-950/35 px-4 py-3 text-sm font-medium text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-300/40 bg-rose-950/35 px-4 py-3 text-sm font-medium text-rose-100">
          {error}
        </div>
      ) : null}
      {goalsError ? (
        <div className="rounded-lg border border-rose-300/40 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
          Could not load goals right now. Please refresh.
        </div>
      ) : null}

      <section className="rounded-xl border border-indigo-300/35 bg-indigo-950/25 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-indigo-100">Progress snapshot</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-indigo-300/35 bg-slate-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Total goals</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{goalSummary.totalGoals}</p>
          </div>
          <div className="rounded-lg border border-indigo-300/35 bg-slate-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Completed</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{goalSummary.completedGoals}</p>
          </div>
          <div className="rounded-lg border border-indigo-300/35 bg-slate-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Avg progress</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{goalSummary.avgProgress}%</p>
          </div>
          <div className="rounded-lg border border-indigo-300/35 bg-slate-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Due in 7 days</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{goalSummary.dueSoonCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-300/35 bg-emerald-950/22 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-emerald-100">Milestone celebrations</h2>

        {celebrationRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-200">
            No milestones yet. Keep contributing to unlock 25/50/75/100% celebrations.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {celebrationRows.map((row) => (
              <li key={row.id} className="rounded-md border border-emerald-300/35 bg-slate-950/30 px-3 py-2">
                <p className="text-sm font-medium text-slate-100">{row.message}</p>
                <p className="mt-1 text-xs text-slate-300/85">
                  {goalNameById.get(row.goal_id) ?? "Goal"} • {row.milestone}% • Triggered {new Date(row.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">
          {editingGoal ? "Edit goal" : "Add a goal"}
        </h2>

        <form action={saveGoal} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="returnTo" value="/goals" />
          {editingGoal ? <input type="hidden" name="goalId" value={editingGoal.id} /> : null}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-200" htmlFor="goal-name">
              Goal name
            </label>
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              defaultValue={editingGoal?.name ?? ""}
              id="goal-name"
              maxLength={120}
              minLength={2}
              name="name"
              placeholder="e.g. Emergency fund, Bike down payment"
              required
              type="text"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-200" htmlFor="goal-target-amount">
                Target amount (INR)
              </label>
              <input
                className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                defaultValue={editingGoal ? Number(editingGoal.target_amount).toFixed(2) : ""}
                id="goal-target-amount"
                min="0.01"
                name="targetAmount"
                required
                step="0.01"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-200" htmlFor="goal-current-amount">
                Current amount (INR)
              </label>
              <input
                className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                defaultValue={editingGoal ? Number(editingGoal.current_amount).toFixed(2) : "0.00"}
                id="goal-current-amount"
                min="0"
                name="currentAmount"
                required
                step="0.01"
                type="number"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-200" htmlFor="goal-deadline">
              Deadline
            </label>
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              defaultValue={editingGoal?.deadline ?? ""}
              id="goal-deadline"
              max="2100-12-31"
              min="2020-01-01"
              name="deadline"
              required
              type="date"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-200" htmlFor="goal-notes">
              Notes (optional)
            </label>
            <textarea
              className="min-h-24 rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              defaultValue={editingGoal?.notes ?? ""}
              id="goal-notes"
              maxLength={500}
              name="notes"
              placeholder="Why this goal matters, contribution plan, or reminders"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              type="submit"
            >
              {editingGoal ? "Save changes" : "Add goal"}
            </button>
            {editingGoal ? (
              <Link className="text-sm font-medium text-slate-300 hover:text-slate-100" href="/goals">
                Cancel
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">Your goals</h2>

        {goalList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            No goals yet. Add your first savings goal above.
          </p>
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-slate-100">
            {goalProgressRows.map((row) => {
              const goal = row.goal;

              const statusClass = row.isCompleted
                ? "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                : row.statusLabel === "Past deadline"
                  ? "border border-rose-300/40 bg-rose-500/20 text-rose-100"
                  : row.statusLabel === "Due soon"
                    ? "border border-amber-300/40 bg-amber-500/20 text-amber-100"
                    : "border border-slate-300/40 bg-slate-600/20 text-slate-100";

              const barClass = row.isCompleted
                ? "bg-emerald-500"
                : row.statusLabel === "Past deadline"
                  ? "bg-red-500"
                  : row.statusLabel === "Due soon"
                    ? "bg-amber-500"
                    : "bg-teal-500";

              return (
                <div key={goal.id} className="flex flex-col gap-2 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{goal.name}</p>
                      <p className="text-xs text-slate-300/85">
                        Deadline: {goal.deadline}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <Link
                        className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
                        href={`/goals?edit=${goal.id}`}
                      >
                        Edit
                      </Link>
                      <form action={deleteGoal}>
                        <input type="hidden" name="goalId" value={goal.id} />
                        <input type="hidden" name="returnTo" value="/goals" />
                        <button
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                          type="submit"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300">
                    INR {Number(goal.current_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {" "}saved of INR {Number(goal.target_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {" "}({row.percent}%)
                  </p>

                  <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${statusClass}`}>
                      {row.statusLabel}
                    </span>
                    {!row.isCompleted ? (
                      <span className="text-slate-300/85">
                        Need INR {row.requiredPerDay.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
                      </span>
                    ) : (
                      <span className="text-emerald-200">Target achieved</span>
                    )}
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/70">
                    <div
                      className={`h-2 rounded-full ${barClass}`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>

                  {!row.isCompleted ? (
                    <p className="text-xs text-slate-300/85">
                      Remaining: INR {row.remaining.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {row.daysRemaining >= 0
                        ? ` • ${row.daysRemaining} day${row.daysRemaining === 1 ? "" : "s"} left`
                        : ` • ${Math.abs(row.daysRemaining)} day${Math.abs(row.daysRemaining) === 1 ? "" : "s"} past deadline`
                      }
                    </p>
                  ) : null}

                  {goal.notes ? <p className="text-xs text-slate-300/85">{goal.notes}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">Goal activity history</h2>

        {milestones.length === 0 ? (
          <p className="mt-2 text-sm text-slate-300">No milestone activity yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {milestones.map((row) => (
              <li key={row.id} className="rounded-md border border-slate-300/35 bg-slate-950/30 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">{goalNameById.get(row.goal_id) ?? "Goal"}</p>
                  <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-xs font-semibold text-slate-200">
                    {row.milestone}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300/85">{row.message}</p>
                <p className="mt-1 text-xs text-slate-400/90">{new Date(row.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MobileFinanceNav active="/goals" />
    </main>
  );
}
