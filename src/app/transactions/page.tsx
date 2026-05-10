import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewTransactionClassification } from "@/app/dashboard/actions";
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
  }>;
};

const PAGE_SIZE = 10;
const SOURCES = ["upi", "card", "wallet", "bank", "unknown"] as const;

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
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.q) params.set("q", input.q);
  if (input.source) params.set("source", input.source);
  if (input.category) params.set("category", input.category);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

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

  if (category) {
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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Transaction history
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Filter by date, category, source, or text to quickly locate expenses.
            </p>
          </div>
          <Link className="text-sm font-medium text-teal-700 hover:text-teal-800" href="/dashboard">
            Back to dashboard
          </Link>
        </div>

        <form className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" method="get">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={q}
            name="q"
            placeholder="Search merchant or reference"
          />

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={source}
            name="source"
          >
            <option value="">All sources</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="wallet">Wallet</option>
            <option value="bank">Bank</option>
            <option value="unknown">Unknown</option>
          </select>

          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={category}
            name="category"
            placeholder="Category"
          />

          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={from}
            name="from"
            type="date"
          />

          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={to}
            name="to"
            type="date"
          />

          <div className="flex gap-2">
            <button
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              type="submit"
            >
              Apply filters
            </button>
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              href="/transactions"
            >
              Clear all
            </Link>
          </div>
        </form>
      </header>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}
      {warning ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Showing {rows.length} of {total} result{total === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-slate-600">Page {page} of {totalPages}</p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not load transaction history. Please retry.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            No matching transactions found for the selected filters.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li className="rounded-lg border border-slate-200 p-4" key={row.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{row.merchant}</p>
                  <p className="text-sm font-semibold text-slate-950">INR {row.amount.toFixed(2)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {new Date(row.date).toLocaleString()} • {row.source.toUpperCase()}
                  {row.category ? ` • ${row.category}` : " • Uncategorized"}
                  {row.reference ? ` • Ref ${row.reference}` : ""}
                </p>

                <div className="mt-2 flex items-start gap-2">
                  {row.ai_classification ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                        row.ai_classification === "wise"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {row.ai_classification}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      pending
                    </span>
                  )}

                  <p className="text-xs text-slate-600">
                    {row.ai_reason ?? "AI reasoning not available yet for this transaction."}
                  </p>
                </div>

                <p className="mt-2 text-xs text-slate-600">
                  Review state: {row.ai_review_state}
                  {row.ai_user_classification ? ` • user=${row.ai_user_classification}` : ""}
                </p>

                <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">
                    Show original AI output (audit)
                  </summary>
                  <p className="mt-2 text-xs text-slate-600">
                    Original label: {row.ai_raw_classification ?? "not recorded"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Original reason: {row.ai_raw_reason ?? "not recorded"}
                  </p>
                </details>

                <div className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                  <form action={reviewTransactionClassification} className="flex flex-wrap items-center gap-2">
                    <input name="transactionId" type="hidden" value={row.id} />
                    <input name="decision" type="hidden" value="accept" />
                    <input name="returnTo" type="hidden" value="/transactions" />
                    <button
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
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
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      defaultValue={row.ai_classification ?? "wise"}
                      name="label"
                    >
                      <option value="wise">wise</option>
                      <option value="useless">useless</option>
                    </select>
                    <input
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2"
                      defaultValue={row.ai_user_reason ?? ""}
                      maxLength={240}
                      minLength={8}
                      name="reason"
                      placeholder="Override reason (optional, 8-240 chars if provided)"
                    />
                    <div className="sm:col-span-3">
                      <button
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 transition hover:bg-rose-100"
                        type="submit"
                      >
                        Save override
                      </button>
                    </div>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <nav aria-label="Pagination" className="mt-5 flex items-center justify-between">
          {hasPrev ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              href={`/transactions${queryString({ page: page - 1, q, source, category, from, to })}`}
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-400">
              Previous
            </span>
          )}

          {hasNext ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              href={`/transactions${queryString({ page: page + 1, q, source, category, from, to })}`}
            >
              Next
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-400">
              Next
            </span>
          )}
        </nav>
      </section>
    </main>
  );
}
