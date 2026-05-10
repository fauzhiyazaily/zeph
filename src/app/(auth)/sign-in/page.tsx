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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <section className="glass-card soft-fade-in rounded-3xl p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-900/70">Welcome back</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Sign in to Zeph
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          Continue to your personal finance cockpit.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        <form action={signInWithPassword} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={nextPath} />

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Email
            <input
              className="rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 outline-none transition focus:border-cyan-700"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Password
            <input
              className="rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 outline-none transition focus:border-cyan-700"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button
            className="mt-2 rounded-xl bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-black"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <form action={signInWithGoogle} className="mt-3">
          <button
            className="w-full rounded-xl border border-slate-300/80 bg-white/80 px-4 py-2.5 font-medium text-slate-800 hover:bg-white"
            type="submit"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          New to Zeph?{" "}
          <Link className="font-semibold text-cyan-700 hover:text-cyan-800" href="/sign-up">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
