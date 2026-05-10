"use client";

import { useSearchParams } from "next/navigation";

function Banner({ text, tone }: { text: string; tone: "success" | "warning" | "error" }) {
  if (!text) {
    return null;
  }

  if (tone === "error") {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {text}
      </p>
    );
  }

  if (tone === "warning") {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {text}
      </p>
    );
  }

  return (
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {text}
    </p>
  );
}

export function DashboardStatusBanner() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message") ?? "";
  const warning = searchParams.get("warning") ?? "";
  const error = searchParams.get("error") ?? "";

  return (
    <>
      <Banner text={error} tone="error" />
      <Banner text={warning} tone="warning" />
      <Banner text={message} tone="success" />
    </>
  );
}
