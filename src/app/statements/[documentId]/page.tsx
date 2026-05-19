import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteFinancialDocument, retryFinancialDocumentProcessing } from "@/app/dashboard/actions";
import { AppShell } from "@/app/components/app-shell";
import type { BankStatementAnalysis } from "@/lib/ingestion/bank-statement-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StatementPageProps = {
  params: Promise<{ documentId: string }>;
};

type FinancialDocumentRow = {
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

type StatementRow = {
  id: string;
  posted_at: string;
  description: string;
  amount: number;
  direction: "credit" | "debit";
  balance: number | null;
  reference: string | null;
  category: string | null;
  is_salary: boolean;
  is_emi: boolean;
  transaction_id: string | null;
};

function statusTone(status: FinancialDocumentRow["parse_status"]) {
  if (status === "completed") {
    return "border-emerald-300/35 bg-emerald-950/25 text-emerald-100";
  }

  if (status === "failed") {
    return "border-rose-300/35 bg-rose-950/25 text-rose-100";
  }

  return "border-amber-300/35 bg-amber-950/25 text-amber-100";
}

export default async function StatementDetailsPage({ params }: StatementPageProps) {
  const { documentId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=/dashboard");
  }

  const { data: document, error: documentError } = await supabase
    .from("financial_documents")
    .select(
      "id,file_name,parse_status,parse_error,bank_name,account_holder_name,account_number_masked,statement_period_start,statement_period_end,transaction_count,imported_debit_count,total_credits,total_debits,opening_balance,closing_balance,processed_at,created_at,extracted_summary",
    )
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle<FinancialDocumentRow>();

  if (documentError || !document) {
    redirect("/dashboard?error=Statement%20not%20found%20or%20not%20accessible.");
  }

  const { data: rows } = await supabase
    .from("financial_document_transactions")
    .select("id,posted_at,description,amount,direction,balance,reference,category,is_salary,is_emi,transaction_id")
    .eq("document_id", document.id)
    .eq("user_id", user.id)
    .order("posted_at", { ascending: false })
    .limit(200)
    .returns<StatementRow[]>();

  const analysis = document.extracted_summary;

  return (
    <AppShell active="/dashboard">
    <main className="app-content mx-auto w-full max-w-[1600px] flex flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
      <header className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(document.parse_status)}`}>
              {document.parse_status}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{document.file_name}</h1>
            <p className="mt-2 text-sm text-slate-300">
              {document.bank_name ?? "Bank not detected"}
              {document.account_holder_name ? ` • ${document.account_holder_name}` : ""}
              {document.account_number_masked ? ` • ${document.account_number_masked}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {document.statement_period_start
                ? `${new Date(document.statement_period_start).toLocaleDateString("en-IN")} to ${new Date(document.statement_period_end ?? document.statement_period_start).toLocaleDateString("en-IN")}`
                : `Uploaded ${new Date(document.created_at).toLocaleString("en-IN")}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded-xl border border-slate-400/35 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/55"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
            <Link
              className="rounded-xl border border-cyan-300/35 bg-cyan-950/20 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-950/35"
              href="/transactions?source=bank"
            >
              Open linked transactions
            </Link>
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
            <form action={retryFinancialDocumentProcessing}>
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="returnTo" value={`/statements/${document.id}`} />
              <button
                className="rounded-xl border border-amber-300/35 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-950/35"
                type="submit"
              >
                Retry processing
              </button>
            </form>
          </div>
        </div>

        {document.parse_status === "failed" ? (
          <p className="mt-4 rounded-xl border border-rose-300/35 bg-rose-950/25 px-3 py-2 text-sm text-rose-100">
            {document.parse_error ?? "Statement parsing failed."}
          </p>
        ) : null}
      </header>

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <h2 className="text-base font-semibold text-slate-50">Summary metrics</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Statement rows</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">{document.transaction_count}</p>
          </article>
          <article className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Imported debits</p>
            <p className="mt-2 text-xl font-semibold text-cyan-200">{document.imported_debit_count}</p>
          </article>
          <article className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total credits</p>
            <p className="mt-2 text-xl font-semibold text-emerald-200">INR {Number(document.total_credits).toFixed(0)}</p>
          </article>
          <article className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total debits</p>
            <p className="mt-2 text-xl font-semibold text-amber-200">INR {Number(document.total_debits).toFixed(0)}</p>
          </article>
          <article className="rounded-2xl border border-slate-300/30 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Health score</p>
            <p className="mt-2 text-xl font-semibold text-violet-200">{analysis?.healthScore ?? "--"}</p>
          </article>
        </div>
      </section>

      {analysis ? (
        <section className="glass-card rounded-2xl p-6 sm:p-7">
          <h2 className="text-base font-semibold text-slate-50">AI-backed statement insights</h2>
          <p className="mt-3 text-sm text-slate-200">{analysis.summary}</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-300/30 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Risk indicators</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {analysis.riskIndicators.length === 0 ? (
                  <li className="rounded-lg border border-emerald-300/30 bg-emerald-950/20 px-3 py-2 text-emerald-100">
                    No immediate risk indicators detected for this statement.
                  </li>
                ) : analysis.riskIndicators.map((item) => (
                  <li className="rounded-lg border border-rose-300/30 bg-rose-950/20 px-3 py-2" key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-300/30 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Recommendations</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {analysis.recommendations.map((item) => (
                  <li className="rounded-lg border border-cyan-300/25 bg-cyan-950/20 px-3 py-2" key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-card rounded-2xl p-6 sm:p-7">
        <h2 className="text-base font-semibold text-slate-50">Parsed statement transactions</h2>
        <p className="mt-2 text-sm text-slate-300">
          Showing latest {rows?.length ?? 0} line items from this uploaded document. Credits remain available here while debit rows can be linked to Zeph spend transactions.
        </p>

        {(rows?.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-300/30 bg-slate-950/25 px-3 py-2 text-sm text-slate-200">
            No parsed rows are available for this statement.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-300/30 bg-slate-950/25">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead className="bg-slate-900/55 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((row) => (
                  <tr className="border-t border-slate-300/20" key={row.id}>
                    <td className="px-3 py-2 text-xs text-slate-300">{new Date(row.posted_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-100">{row.description}</p>
                      <p className="text-xs text-slate-400">{row.reference ? `Ref ${row.reference}` : "No reference"}</p>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      <span className={row.direction === "credit" ? "text-emerald-200" : "text-amber-200"}>{row.direction}</span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-100">INR {row.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">{row.balance === null ? "--" : `INR ${row.balance.toFixed(2)}`}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">{row.category ?? "Uncategorized"}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      {[row.is_salary ? "salary" : null, row.is_emi ? "emi" : null, row.transaction_id ? "linked" : null]
                        .filter(Boolean)
                        .join(" • ") || "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </main>
    </AppShell>
  );
}
