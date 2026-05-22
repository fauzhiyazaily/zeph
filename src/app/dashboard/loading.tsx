import { AppShell } from "@/app/components/app-shell";

export default function DashboardLoading() {
  return (
    <AppShell active="/dashboard">
      <main className="app-content mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
        <section className="rounded-2xl border border-slate-300/30 bg-slate-900/35 p-6">
          <p className="text-sm font-medium text-slate-300">Loading dashboard insights...</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 animate-pulse rounded-xl border border-slate-400/25 bg-slate-800/40"
              />
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-400/25 bg-slate-800/35" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-400/25 bg-slate-800/35" />
        </section>
      </main>
    </AppShell>
  );
}