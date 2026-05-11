import Link from "next/link";
import { signUpWithPassword } from "@/app/(auth)/actions";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignUpPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const error = firstValue(searchParams.error);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-5 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute -left-8 bottom-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-14 h-52 w-52 rounded-full bg-indigo-500/25 blur-3xl" />

      <section className="soft-fade-in grid w-full gap-6 md:grid-cols-[1fr_1.08fr] md:items-stretch">
        <article className="glass-card rounded-3xl p-6 sm:p-7 lg:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">Get started</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Create your Zeph account
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Start tracking spending and savings with AI guidance.
          </p>

          {error ? (
            <p className="mt-4 rounded-lg border border-rose-400/35 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          <form action={signUpWithPassword} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Email
              <input
                className="rounded-xl border border-indigo-300/35 bg-slate-950/45 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/25"
                type="email"
                name="email"
                autoComplete="email"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Password
              <input
                className="rounded-xl border border-indigo-300/35 bg-slate-950/45 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/25"
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <button
              className="mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 font-medium text-white shadow-[0_16px_30px_-18px_rgba(16,185,129,0.9)] hover:brightness-110"
              type="submit"
            >
              Create account
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-300">
            Already have an account?{" "}
            <Link className="font-semibold text-emerald-300 hover:text-emerald-200" href="/sign-in">
              Sign in
            </Link>
          </p>
        </article>

        <article className="glass-card hidden rounded-3xl p-7 md:flex md:flex-col md:justify-between lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/85">Why Zeph</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Build better money habits with less noise.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
              Zeph keeps your spending, budgets, and goals aligned in one lightweight flow designed for quick daily decisions.
            </p>
          </div>

          <ul className="mt-8 space-y-3 text-sm text-slate-200/90">
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              Smart category and wise/useless spend classification.
            </li>
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              Budget and alert signals that surface what matters first.
            </li>
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              Goal milestones and progress snapshots at a glance.
            </li>
          </ul>
        </article>
      </section>
    </main>
  );
}
