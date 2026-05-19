import Link from "next/link";
import { redirect } from "next/navigation";
import { archiveGoal, unarchiveGoal } from "@/app/goals/actions";
import { AppShell } from "@/app/components/app-shell";
import { type Goal } from "@/lib/goals/goal-helpers";
import {
  buildGoalHistoryRows,
  filterGoalHistoryRows,
  type GoalHistoryFilter,
} from "@/lib/goals/history";
import { computeGoalProgress, summarizeGoalProgress } from "@/lib/goals/progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type GoalsHistoryPageProps = {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
};

function normalizeFilter(input: string | undefined): GoalHistoryFilter {
  if (input === "completed" || input === "past" || input === "archived") {
    return input;
  }
  return "all";
}

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function queryString(input: {
  filter?: GoalHistoryFilter;
  q?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.q) params.set("q", input.q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

function filterHref(filter: GoalHistoryFilter, q?: string) {
  return `/goals/history${queryString({ filter, q })}`;
}

export default async function GoalsHistoryPage({ searchParams }: GoalsHistoryPageProps) {
  const params = await searchParams;
  const activeFilter = normalizeFilter(params.filter);
  const searchQuery = (params.q ?? "").trim();
  const page = parsePage(params.page);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id,user_id,name,target_amount,current_amount,deadline,notes,archived_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<Goal[]>();

  const progressRows = (goals ?? []).map((goal) => computeGoalProgress(goal));
  const allHistoryRows = buildGoalHistoryRows(progressRows);
  let filteredRows = filterGoalHistoryRows(allHistoryRows, activeFilter);

  // Apply search filter
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    filteredRows = filteredRows.filter((row) =>
      row.goal.name.toLowerCase().includes(lowerQuery) ||
      row.goal.notes?.toLowerCase().includes(lowerQuery)
    );
  }

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = filteredRows.slice(start, end);

  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;

  const completedRows = allHistoryRows.filter((row) => row.status === "completed");
  const pastRows = allHistoryRows.filter((row) => row.status === "past");
  const archivedRows = allHistoryRows.filter((row) => row.status === "archived");
  const summary = summarizeGoalProgress(progressRows);

  const statusTotals = {
    all: allHistoryRows.length,
    completed: completedRows.length,
    past: pastRows.length,
    archived: archivedRows.length,
  };

  return (
    <AppShell active="/goals">
    <main className="app-content soft-fade-in relative mx-auto w-full max-w-[1600px] flex flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
      <header className="glass-card rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Goals history</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
              Completed, past, and archived
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Review prior goals to learn from savings journeys and restore archived items as needed.
            </p>
          </div>
          <Link className="text-sm font-semibold text-cyan-200 hover:text-cyan-100" href="/goals">
            ← Active goals
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            Total: <span className="font-semibold text-slate-100">{summary.totalGoals}</span>
          </div>
          <div className="rounded-xl border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            Completed: <span className="font-semibold text-slate-100">{statusTotals.completed}</span>
          </div>
          <div className="rounded-xl border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            Past deadline: <span className="font-semibold text-slate-100">{statusTotals.past}</span>
          </div>
          <div className="rounded-xl border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            Archived: <span className="font-semibold text-slate-100">{statusTotals.archived}</span>
          </div>
        </div>
      </header>

      <section className="glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "completed", "past", "archived"] as const).map((filter) => (
              <Link
                key={filter}
                href={filterHref(filter, searchQuery)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  activeFilter === filter
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-400/35 bg-slate-950/25 text-slate-200 hover:bg-slate-900/55"
                }`}
              >
                {filter === "all"
                  ? "All history"
                  : filter === "completed"
                    ? "Completed"
                    : filter === "past"
                      ? "Past deadline"
                      : "Archived"}
              </Link>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search goals..."
            defaultValue={searchQuery}
            className="flex-1 rounded-xl border border-slate-400/35 bg-slate-950/30 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-400 hover:bg-slate-900/55 sm:max-w-sm"
            onChange={(e) => {
              const q = e.currentTarget.value.trim();
              const url = new URL(window.location.href);
              if (q) {
                url.searchParams.set("q", q);
                url.searchParams.delete("page");
              } else {
                url.searchParams.delete("q");
              }
              window.location.href = url.toString();
            }}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-300/40 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
            Could not load goal history right now. Please refresh.
          </p>
        ) : pageRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-300/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            {searchQuery
              ? `No goals match "${searchQuery}" in this filter.`
              : "No goals match this filter yet."}
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-3">
              {pageRows.map((row) => (
                <li key={row.goal.id} className="rounded-xl border border-slate-300/35 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-slate-100">{row.goal.name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                        row.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.status === "past"
                            ? "bg-amber-100 text-amber-800"
                            : "border border-slate-300/40 bg-slate-600/20 text-slate-100"
                      }`}
                    >
                      {row.status === "completed"
                        ? "Completed"
                        : row.status === "past"
                          ? "Past deadline"
                          : "Archived"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-300">
                    INR {Number(row.goal.current_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {" "}saved of INR {Number(row.goal.target_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {" "}({row.progress.percent}%)
                  </p>

                  <div className="mt-2 grid gap-2 text-xs text-slate-300/85 sm:grid-cols-3">
                    <p>Deadline: {row.goal.deadline}</p>
                    <p>Last update: {new Date(row.goal.updated_at).toLocaleDateString()}</p>
                    <p>
                      {row.progress.isCompleted
                        ? "Target achieved"
                        : `Remaining: INR ${row.progress.remaining.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800/70">
                    <div
                      className={`h-2 rounded-full ${
                        row.status === "completed"
                          ? "bg-emerald-500"
                          : row.status === "past"
                            ? "bg-amber-500"
                            : "bg-slate-400"
                      }`}
                      style={{ width: `${row.progress.percent}%` }}
                    />
                  </div>

                  {row.goal.notes ? (
                    <p className="mt-2 text-xs text-slate-300/85">{row.goal.notes}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.status === "archived" ? (
                      <form action={unarchiveGoal} className="inline">
                        <input type="hidden" name="goalId" value={row.goal.id} />
                        <input type="hidden" name="returnTo" value={window.location.pathname + window.location.search} />
                        <button
                          type="submit"
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Restore
                        </button>
                      </form>
                    ) : (
                      <form action={archiveGoal} className="inline">
                        <input type="hidden" name="goalId" value={row.goal.id} />
                        <input type="hidden" name="returnTo" value={window.location.pathname + window.location.search} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-400/35 bg-slate-950/25 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-900/55"
                        >
                          Archive
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-300">
                Showing {start + 1}–{Math.min(end, totalRows)} of {totalRows}
              </p>

              <div className="flex gap-2">
                {hasPrev ? (
                  <Link
                    href={`/goals/history${queryString({ filter: activeFilter, q: searchQuery, page: safePage - 1 })}`}
                    className="rounded-md border border-slate-400/35 bg-slate-950/25 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-900/55"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-md border border-slate-500/35 bg-slate-950/20 px-3 py-1.5 text-sm text-slate-400/90">
                    Previous
                  </span>
                )}

                {hasNext ? (
                  <Link
                    href={`/goals/history${queryString({ filter: activeFilter, q: searchQuery, page: safePage + 1 })}`}
                    className="rounded-md border border-slate-400/35 bg-slate-950/25 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-900/55"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-md border border-slate-500/35 bg-slate-950/20 px-3 py-1.5 text-sm text-slate-400/90">
                    Next
                  </span>
                )}
              </div>
            </nav>
          </>
        )}
      </section>

    </main>
    </AppShell>
  );
}
