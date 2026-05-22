"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, X, Check } from "lucide-react";

type SetBalanceTargetAction = (formData: FormData) => Promise<{ error: string | null }>;
type ClearBalanceTargetAction = () => Promise<{ error: string | null }>;

interface BalanceTargetCardProps {
  initialValue: number;
  isUserSet: boolean;
  clearBalanceTarget: ClearBalanceTargetAction;
  setBalanceTarget: SetBalanceTargetAction;
}

export function BalanceTargetCard({
  initialValue,
  isUserSet,
  clearBalanceTarget,
  setBalanceTarget,
}: BalanceTargetCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(initialValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setInputValue(String(initialValue));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function handleSave() {
    const parsed = Number(inputValue);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Must be a positive number.");
      return;
    }

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("balance_target", String(parsed));

    const result = await setBalanceTarget(formData);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleResetToAuto() {
    setSaving(true);
    setError(null);

    const result = await clearBalanceTarget();

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  return (
    <article className="min-h-[5.5rem] min-w-0 rounded-2xl border border-slate-700/70 bg-slate-950/35 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* ZEPH-FIX: sentence-case label with higher contrast (issue 6); fluid eyebrow scale */}
        <p className="text-fluid-eyebrow font-medium text-slate-300">Current balance target</p>
        {isUserSet && (
          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-sky-300">
            custom
          </span>
        )}
        {!editing && (
          <div className="ml-auto flex items-center gap-2">
            {isUserSet ? (
              <button
                aria-label="Reset balance target to auto"
                className="rounded-lg border border-slate-600/70 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={handleResetToAuto}
                type="button"
              >
                Auto
              </button>
            ) : null}
            <button
              aria-label="Edit balance target"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              disabled={saving}
              onClick={openEdit}
              type="button"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">INR</span>
            <input
              autoFocus
              className="w-36 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-lg font-bold text-slate-50 focus:border-sky-500 focus:outline-none"
              disabled={saving}
              onChange={(e) => setInputValue(e.target.value)}
              type="number"
              value={inputValue}
            />
            <button
              aria-label="Save balance target"
              className="rounded-lg bg-sky-600 p-1.5 text-white transition hover:bg-sky-500 disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              aria-label="Cancel editing"
              className="rounded-lg p-1.5 text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
              disabled={saving}
              onClick={cancelEdit}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
      ) : (
        <p className="mt-3 text-fluid-stat font-bold text-slate-50">
          INR {initialValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </p>
      )}
    </article>
  );
}
