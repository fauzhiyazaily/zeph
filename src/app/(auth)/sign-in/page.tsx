import Link from "next/link";
import { signInWithGoogle, signInWithPassword } from "@/app/(auth)/actions";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const error = firstValue(searchParams.error);
  const message = firstValue(searchParams.message);
  const nextPath = firstValue(searchParams.next) ?? "/dashboard";

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-5 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute -left-12 top-16 h-40 w-40 rounded-full bg-cyan-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 bottom-20 h-52 w-52 rounded-full bg-violet-500/25 blur-3xl" />

      <section className="soft-fade-in grid w-full gap-6 md:grid-cols-[1.08fr_1fr] md:items-stretch">
        <article className="glass-card hidden rounded-3xl p-7 md:flex md:flex-col md:justify-between lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/85">Welcome back</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Money clarity in one glance.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
              Zeph helps you audit spend quality, stay on budget, and build savings momentum without noisy dashboards.
            </p>
          </div>

          <ul className="mt-8 space-y-3 text-sm text-slate-200/90">
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              AI classification with transparent review controls.
            </li>
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              Budget alerts and action guidance for this month.
            </li>
            <li className="rounded-2xl border border-indigo-300/30 bg-slate-950/25 px-4 py-3">
              Goal progress snapshots that stay lightweight.
            </li>
          </ul>
        </article>

        <article className="glass-card rounded-3xl p-6 sm:p-7 lg:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Sign in</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Continue to Zeph</h2>
          <p className="mt-2 text-sm text-slate-300">Use your account to open your finance cockpit.</p>

          {error ? (
            <p className="mt-4 rounded-lg border border-rose-400/35 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="mt-4 rounded-lg border border-emerald-400/35 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}

          <form action={signInWithPassword} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="next" value={nextPath} />

            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Email
              <input
                className="rounded-xl border border-indigo-300/35 bg-slate-950/45 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/25"
                type="email"
                name="email"
                autoComplete="email"
                required
                suppressHydrationWarning
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Password
              <input
                className="rounded-xl border border-indigo-300/35 bg-slate-950/45 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/25"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                suppressHydrationWarning
              />
            </label>

            <button
              className="mt-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 font-medium text-white shadow-[0_16px_30px_-18px_rgba(34,211,238,0.9)] hover:brightness-110"
              type="submit"
              suppressHydrationWarning
            >
              Sign in
            </button>
          </form>

          <form action={signInWithGoogle} className="mt-3">
            <button
              className="w-full rounded-xl border border-indigo-300/40 bg-slate-900/40 px-4 py-2.5 font-medium text-slate-100 hover:bg-slate-900/55"
              type="submit"
              suppressHydrationWarning
            >
              Continue with Google
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-300">
            New to Zeph?{" "}
            <Link className="font-semibold text-cyan-300 hover:text-cyan-200" href="/sign-up">
              Create an account
            </Link>
          </p>
        </article>
      </section>
    </main>
  );
}
