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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Payment Message Permission
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Zeph reads incoming payment messages only to auto-create transactions. You can
          grant or revoke this permission anytime.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Current status</h2>
        <p className="mt-2 text-sm text-slate-600">
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
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              type="submit"
            >
              Revoke permission
            </button>
          </form>
        </div>

        <div className="mt-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Continue to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
