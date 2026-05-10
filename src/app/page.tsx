import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 sm:px-8">
      <div className="pointer-events-none absolute -left-12 top-16 h-40 w-40 rounded-full bg-orange-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-12 h-48 w-48 rounded-full bg-teal-300/35 blur-3xl" />

      <section className="glass-card soft-fade-in relative w-full max-w-4xl overflow-hidden rounded-3xl p-8 sm:p-12">
        <div className="absolute right-0 top-0 h-28 w-28 -translate-y-1/3 translate-x-1/4 rounded-full border border-white/60 bg-white/40" />

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-900/75">Zeph</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
          Turn daily spending into a clear plan, not a guessing game
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
          Zeph combines automated transaction capture, AI spend classification, and live budget and goal tracking so your money decisions feel intentional every day.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-950"
          >
            Start free
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300/80 bg-white/75 px-5 py-2.5 font-semibold text-slate-700 hover:-translate-y-0.5 hover:bg-white"
          >
            I already have an account
          </Link>
        </div>

        <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-slate-700">
            AI labels spend as wise or useless with human override.
          </div>
          <div className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-slate-700">
            Live utilization bars and proactive budget alerts.
          </div>
          <div className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-slate-700">
            Savings goals with milestone celebrations and history.
          </div>
        </div>
      </section>
    </main>
  );
}
