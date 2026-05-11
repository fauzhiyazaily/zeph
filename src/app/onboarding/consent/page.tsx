import Link from "next/link";
import { redirect } from "next/navigation";
import { updateMessageReadingConsent } from "@/app/(auth)/actions";
import { getMessageReadingConsent } from "@/lib/consent";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const dynamic = "force-dynamic";

export default async function ConsentOnboardingPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const message = firstValue(searchParams.message);
  const error = firstValue(searchParams.error);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=/onboarding/consent");
  }

  const consent = getMessageReadingConsent(user);

  return (
    <main className="finance-shell mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Payment Message Permission
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Zeph reads incoming payment messages only to auto-create transactions. You can
          grant or revoke this permission anytime.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-300/40 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-emerald-300/40 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-300/35 bg-slate-950/35 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-100">Current status</h2>
        <p className="mt-2 text-sm text-slate-300">
          {consent?.granted
            ? `Enabled (updated ${new Date(consent.updatedAt).toLocaleString()})`
            : "Not enabled"}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <form action={updateMessageReadingConsent}>
            <input type="hidden" name="granted" value="true" />
            <input type="hidden" name="returnTo" value="/onboarding/consent" />
            <button
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800"
              type="submit"
            >
              Grant permission
            </button>
          </form>

          <form action={updateMessageReadingConsent}>
            <input type="hidden" name="granted" value="false" />
            <input type="hidden" name="returnTo" value="/onboarding/consent" />
            <button
              className="rounded-md border border-slate-400/35 bg-slate-950/25 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/55"
              type="submit"
            >
              Revoke permission
            </button>
          </form>
        </div>

        <div className="mt-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-cyan-200 hover:text-cyan-100"
          >
            Continue to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
