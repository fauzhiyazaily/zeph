import Link from "next/link";
import { redirect } from "next/navigation";
import {
  assignTransactionCategory,
  createManualExpense,
  reviewTransactionClassification,
} from "@/app/dashboard/actions";
import { AppShell } from "@/app/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TransactionRow = {
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

type PageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    source?: string;
    category?: string;
    from?: string;
    to?: string;
    message?: string;
    error?: string;
    warning?: string;
    uncategorized?: string;
  }>;
};

const PAGE_SIZE = 10;
const SOURCES = ["upi", "card", "wallet", "bank", "unknown"] as const;

function sourceAccent(source: string) {
  switch (source) {
    case "upi":
      return "from-violet-500/35 to-fuchsia-500/35 border-violet-300/45 text-violet-100";
    case "card":
      return "from-sky-500/35 to-indigo-500/35 border-sky-300/45 text-sky-100";
    case "wallet":
      return "from-emerald-500/35 to-cyan-500/35 border-emerald-300/45 text-emerald-100";
    case "bank":
      return "from-amber-500/35 to-orange-500/35 border-amber-300/45 text-amber-100";
    default:
      return "from-slate-500/30 to-slate-400/30 border-slate-300/40 text-slate-100";
  }
}

function SourceIcon({ source }: { source: string }) {
  if (source === "upi") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 8h12" />
        <path d="M6 12h10" />
        <path d="M6 16h7" />
        <path d="M17 9l3 3-3 3" />
      </svg>
    );
  }

  if (source === "card") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  if (source === "wallet") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M16 12h3" />
        <circle cx="15" cy="12" r="1" />
      </svg>
    );
  }

  if (source === "bank") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10h16" />
        <path d="M6 10v7" />
        <path d="M10 10v7" />
        <path d="M14 10v7" />
        <path d="M18 10v7" />
        <path d="M3 17h18" />
        <path d="M12 4 3 8h18z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6" />
    </svg>
  );
}

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function queryString(input: {
  page?: number;
  q?: string;
  source?: string;
  category?: string;
  from?: string;
  to?: string;
  uncategorized?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.q) params.set("q", input.q);
  if (input.source) params.set("source", input.source);
  if (input.category) params.set("category", input.category);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.uncategorized) params.set("uncategorized", input.uncategorized);
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = (params.q ?? "").trim();
  const source = (params.source ?? "").trim().toLowerCase();
  const category = (params.category ?? "").trim();
  const from = (params.from ?? "").trim();
  const to = (params.to ?? "").trim();
  const message = (params.message ?? "").trim();
  const errorMessage = (params.error ?? "").trim();
  const warning = (params.warning ?? "").trim();
  const uncategorizedOnly = params.uncategorized === "1";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  const { data: uncategorizedQueue, error: uncategorizedQueueError } = await supabase
    .from("transactions")
    .select(
      "id,amount,merchant,source,reference,date,category,ai_classification,ai_reason,ai_raw_classification,ai_raw_reason,ai_user_classification,ai_user_reason,ai_review_state",
    )
    .eq("user_id", user.id)
    .or("category.is.null,category.eq.")
    .order("date", { ascending: false })
    .limit(6)
    .returns<TransactionRow[]>();

  const uncategorizedQueueRows = uncategorizedQueue ?? [];

  let query = supabase
    .from("transactions")
    .select(
      "id,amount,merchant,source,reference,date,category,ai_classification,ai_reason,ai_raw_classification,ai_raw_reason,ai_user_classification,ai_user_reason,ai_review_state",
      {
        count: "exact",
      },
    )
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  if (q) {
    const escaped = q.replace(/,/g, " ");
    query = query.or(`merchant.ilike.%${escaped}%,reference.ilike.%${escaped}%`);
  }

  if (source && SOURCES.includes(source as (typeof SOURCES)[number])) {
    query = query.eq("source", source);
  }

  if (uncategorizedOnly) {
    query = query.or("category.is.null,category.eq.");
  } else if (category) {
    query = query.ilike("category", category);
  }

  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) {
      query = query.gte("date", fromDate.toISOString());
    }
  }

  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      query = query.lte("date", toDate.toISOString());
    }
  }

  const { data, count, error } = await query.range(start, end).returns<TransactionRow[]>();
  const rows = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <AppShell active="/transactions">
    <main className="app-content mx-auto w-full max-w-[1600px] flex flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
      <header className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              Transaction history
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Filter by date, category, source, or text to quickly locate expenses.
            </p>
          </div>
          <Link className="text-sm font-medium text-cyan-200 hover:text-cyan-100" href="/dashboard">
            Back to dashboard
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-amber-300/45 bg-amber-950/35 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
            {uncategorizedQueueRows.length} uncategorized pending
          </span>
          <Link
            className="text-xs font-medium text-cyan-200 underline hover:text-cyan-100"
            href={`/transactions${queryString({ q, source, from, to, uncategorized: uncategorizedOnly ? undefined : "1" })}`}
          >
            {uncategorizedOnly ? "Viewing uncategorized only" : "Show uncategorized only"}
          </Link>
          {uncategorizedOnly ? (
            <Link
              className="text-xs font-medium text-cyan-200 underline hover:text-cyan-100"
              href={`/transactions${queryString({ q, source, category, from, to })}`}
            >
              Clear uncategorized filter
            </Link>
          ) : null}
        </div>

        {uncategorizedQueueError ? (
          <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
            Could not load uncategorized queue right now.
          </p>
        ) : uncategorizedQueueRows.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/35 bg-slate-950/30 p-4">
            <p className="text-sm font-semibold text-amber-100">Uncategorized queue</p>
            <p className="mt-1 text-xs text-slate-300">
              Assign categories quickly to keep dashboards and reports accurate.
            </p>
            <ul className="mt-3 space-y-2">
              {uncategorizedQueueRows.map((row) => (
                <li className="rounded-lg border border-amber-300/30 bg-slate-900/30 p-3" key={`uncategorized-${row.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{row.merchant}</p>
                    <p className="text-sm font-semibold text-slate-100">INR {row.amount.toFixed(2)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-300/85">
                    {new Date(row.date).toLocaleString()} • {row.source.toUpperCase()}
                    {row.reference ? ` • Ref ${row.reference}` : ""}
                  </p>
                  <form action={assignTransactionCategory} className="mt-2 flex flex-wrap items-center gap-2">
                    <input name="transactionId" type="hidden" value={row.id} />
                    <input name="returnTo" type="hidden" value="/transactions" />
                    <input
                      className="min-w-44 flex-1 rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400"
                      list={`uncategorized-queue-category-${row.id}`}
                      maxLength={40}
                      minLength={2}
                      name="category"
                      placeholder="Assign category"
                      required
                    />
                    <datalist id={`uncategorized-queue-category-${row.id}`}>
                      <option value="Food" />
                      <option value="Transport" />
                      <option value="Groceries" />
                      <option value="Bills" />
                      <option value="Shopping" />
                      <option value="Health" />
                      <option value="Entertainment" />
                      <option value="Other" />
                    </datalist>
                    <button
                      className="rounded-md border border-amber-300/45 bg-amber-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-700"
                      type="submit"
                    >
                      Save
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-emerald-300/35 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
            All transactions are categorized.
          </p>
        )}

        <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" method="get">
          {uncategorizedOnly ? <input name="uncategorized" type="hidden" value="1" /> : null}

          <label className="sr-only" htmlFor="filter-search">Search merchant or reference</label>
          <input
            className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
            defaultValue={q}
            id="filter-search"
            name="q"
            placeholder="Search merchant or reference"
          />

          <label className="sr-only" htmlFor="filter-source">Filter source</label>
          <select
            className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
            defaultValue={source}
            id="filter-source"
            name="source"
          >
            <option value="">All sources</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="wallet">Wallet</option>
            <option value="bank">Bank</option>
            <option value="unknown">Unknown</option>
          </select>

          <label className="sr-only" htmlFor="filter-category">Filter category</label>
          <input
            className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
            defaultValue={category}
            id="filter-category"
            name="category"
            placeholder="Category"
          />

          <label className="sr-only" htmlFor="filter-from-date">From date</label>
          <input
            className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
            defaultValue={from}
            id="filter-from-date"
            name="from"
            type="date"
          />

          <label className="sr-only" htmlFor="filter-to-date">To date</label>
          <input
            className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
            defaultValue={to}
            id="filter-to-date"
            name="to"
            type="date"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              type="submit"
            >
              Apply filters
            </button>
            <Link
              className="rounded-lg border border-slate-400/35 bg-slate-950/25 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-900/55"
              href="/transactions"
            >
              Clear all
            </Link>
          </div>
        </form>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-100">Workflow steps</h2>
          <p className="mt-1 text-sm text-slate-300">Follow these pages one by one.</p>
          <ol className="mt-4 space-y-2">
            <li className="rounded-md border border-slate-300/35 bg-slate-950/25 px-3 py-2 text-sm text-slate-200">
              1. Open searchable transaction history
            </li>
            <li className="rounded-md border border-slate-300/35 bg-slate-950/25 px-3 py-2 text-sm text-slate-200">
              2. <Link className="font-medium text-cyan-200 hover:text-cyan-100" href="/budgets">Manage budgets</Link>
            </li>
            <li className="rounded-md border border-slate-300/35 bg-slate-950/25 px-3 py-2 text-sm text-slate-200">
              3. <Link className="font-medium text-cyan-200 hover:text-cyan-100" href="/goals">Manage goals</Link>
            </li>
          </ol>
        </article>

        <article className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-100">Manual expense entry</h2>
          <p className="mt-1 text-sm text-slate-300">
            Entries created here participate in search, AI review, budgets, and goal insights.
          </p>
          <form action={createManualExpense} className="mt-4 grid gap-2 sm:grid-cols-2">
            <input name="returnTo" type="hidden" value="/transactions" />
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              maxLength={120}
              minLength={2}
              name="merchant"
              placeholder="Merchant"
              required
            />
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              min="0.01"
              name="amount"
              placeholder="Amount"
              required
              step="0.01"
              type="number"
            />
            <select className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100" defaultValue="card" name="source">
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="wallet">Wallet</option>
              <option value="bank">Bank</option>
              <option value="unknown">Unknown</option>
            </select>
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              maxLength={40}
              name="category"
              placeholder="Category (optional)"
            />
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              maxLength={80}
              name="reference"
              placeholder="Reference (optional)"
            />
            <input
              className="rounded-md border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-sm text-slate-100"
              defaultValue={new Date().toISOString().slice(0, 16)}
              name="date"
              required
              type="datetime-local"
            />
            <div className="sm:col-span-2">
              <button
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800"
                type="submit"
              >
                Save manual expense
              </button>
            </div>
          </form>
        </article>
      </section>

      {errorMessage ? (
        <p className="rounded-xl border border-rose-300/40 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}
      {warning ? (
        <p className="rounded-xl border border-amber-300/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-100">
          {warning}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-300/40 bg-emerald-950/35 px-4 py-3 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-300">
            Showing {rows.length} of {total} result{total === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-slate-300">Page {page} of {totalPages}</p>
        </div>

        {error ? (
          <p className="rounded-md border border-rose-300/40 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
            Could not load transaction history. Please retry.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-slate-300/35 bg-slate-950/35 px-3 py-2 text-sm text-slate-200">
            No matching transactions found for the selected filters.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 p-4 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.95)] sm:p-5" key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${sourceAccent(row.source)}`}
                    >
                      <SourceIcon source={row.source} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{row.merchant}</p>
                      <p className="mt-1 break-words text-xs leading-relaxed text-slate-300/85">
                        {new Date(row.date).toLocaleString()} • {row.source.toUpperCase()}
                        {row.category ? ` • ${row.category}` : " • Uncategorized"}
                        {row.reference ? ` • Ref ${row.reference}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-cyan-100">INR {row.amount.toFixed(2)}</p>
                </div>

                <div className="mt-3 flex items-start gap-2">
                  {row.ai_classification ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                        row.ai_classification === "wise"
                          ? "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                          : "border border-rose-300/40 bg-rose-500/20 text-rose-100"
                      }`}
                    >
                      {row.ai_classification}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-400/40 bg-slate-600/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-200">
                      pending
                    </span>
                  )}

                  <p className="text-xs leading-relaxed text-slate-300/85">
                    {row.ai_reason ?? "AI reasoning not available yet for this transaction."}
                  </p>
                </div>

                <p className="mt-2 text-xs text-slate-300/80">
                  Review state: {row.ai_review_state}
                  {row.ai_user_classification ? ` • user=${row.ai_user_classification}` : ""}
                </p>

                <details className="mt-2 rounded-xl border border-slate-400/30 bg-slate-900/30 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-200">
                    Show original AI output (audit)
                  </summary>
                  <p className="mt-2 text-xs text-slate-300/85">
                    Original label: {row.ai_raw_classification ?? "not recorded"}
                  </p>
                  <p className="mt-1 text-xs text-slate-300/85">
                    Original reason: {row.ai_raw_reason ?? "not recorded"}
                  </p>
                </details>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-indigo-300/30 bg-slate-900/35 p-3">
                  <form action={reviewTransactionClassification} className="flex flex-wrap items-center gap-2">
                    <input name="transactionId" type="hidden" value={row.id} />
                    <input name="decision" type="hidden" value="accept" />
                    <input name="returnTo" type="hidden" value="/transactions" />
                    <button
                      className="rounded-md border border-emerald-300/45 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/30"
                      type="submit"
                    >
                      Accept AI label
                    </button>
                  </form>

                  <form action={reviewTransactionClassification} className="grid gap-2 sm:grid-cols-3">
                    <input name="transactionId" type="hidden" value={row.id} />
                    <input name="decision" type="hidden" value="override" />
                    <input name="returnTo" type="hidden" value="/transactions" />
                    <select
                      className="rounded-md border border-slate-400/35 bg-slate-950/30 px-2 py-1.5 text-xs text-slate-100"
                      defaultValue={row.ai_classification ?? "wise"}
                      name="label"
                    >
                      <option value="wise">wise</option>
                      <option value="useless">useless</option>
                    </select>
                    <input
                      className="rounded-md border border-slate-400/35 bg-slate-950/30 px-2 py-1.5 text-xs text-slate-100 sm:col-span-2"
                      defaultValue={row.ai_user_reason ?? ""}
                      maxLength={240}
                      minLength={8}
                      name="reason"
                      placeholder="Override reason (optional, 8-240 chars if provided)"
                    />
                    <div className="sm:col-span-3">
                      <button
                        className="rounded-md border border-rose-300/45 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30"
                        type="submit"
                      >
                        Save override
                      </button>
                    </div>
                  </form>

                  <form action={assignTransactionCategory} className="grid gap-2 sm:grid-cols-3">
                    <input name="transactionId" type="hidden" value={row.id} />
                    <input name="returnTo" type="hidden" value="/transactions" />
                    <input
                      className="rounded-md border border-slate-400/35 bg-slate-950/30 px-2 py-1.5 text-xs text-slate-100 sm:col-span-2"
                      defaultValue={row.category ?? ""}
                      list={`transactions-category-suggestions-${row.id}`}
                      maxLength={40}
                      minLength={2}
                      name="category"
                      placeholder="Assign category"
                      required
                    />
                    <datalist id={`transactions-category-suggestions-${row.id}`}>
                      <option value="Food" />
                      <option value="Transport" />
                      <option value="Groceries" />
                      <option value="Bills" />
                      <option value="Shopping" />
                      <option value="Health" />
                      <option value="Entertainment" />
                      <option value="Other" />
                    </datalist>
                    <div className="sm:col-span-3">
                      <button
                        className="rounded-md border border-amber-300/45 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/30"
                        type="submit"
                      >
                        Save category
                      </button>
                    </div>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3">
          {hasPrev ? (
            <Link
              className="rounded-md border border-slate-400/35 bg-slate-950/25 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/55"
              href={`/transactions${queryString({ page: page - 1, q, source, category, from, to, uncategorized: uncategorizedOnly ? "1" : undefined })}`}
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-md border border-slate-500/35 bg-slate-950/20 px-3 py-2 text-sm text-slate-400/90">
              Previous
            </span>
          )}

          {hasNext ? (
            <Link
              className="rounded-md border border-slate-400/35 bg-slate-950/25 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/55"
              href={`/transactions${queryString({ page: page + 1, q, source, category, from, to, uncategorized: uncategorizedOnly ? "1" : undefined })}`}
            >
              Next
            </Link>
          ) : (
            <span className="rounded-md border border-slate-500/35 bg-slate-950/20 px-3 py-2 text-sm text-slate-400/90">
              Next
            </span>
          )}
        </nav>
      </section>

    </main>
    </AppShell>
  );
}
