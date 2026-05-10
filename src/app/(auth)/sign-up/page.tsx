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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <section className="glass-card soft-fade-in rounded-3xl p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900/70">Get started</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Create your Zeph account
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          Start tracking spending and savings with AI guidance.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={signUpWithPassword} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Email
            <input
              className="rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 outline-none transition focus:border-emerald-700"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Password
            <input
              className="rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 outline-none transition focus:border-emerald-700"
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <button
            className="mt-2 rounded-xl bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-black"
            type="submit"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href="/sign-in">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
