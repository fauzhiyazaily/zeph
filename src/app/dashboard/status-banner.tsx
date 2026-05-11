"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type ToastTone = "success" | "warning" | "error";

function toastToneClasses(tone: ToastTone) {
  if (tone === "error") {
    return "border-rose-300/45 bg-rose-950/40 text-rose-100";
  }
  if (tone === "warning") {
    return "border-amber-300/45 bg-amber-950/35 text-amber-100";
  }
  return "border-emerald-300/45 bg-emerald-950/30 text-emerald-100";
}

function toastToneIcon(tone: ToastTone) {
  if (tone === "error") {
    return <XCircle aria-hidden="true" className="h-4 w-4" />;
  }
  if (tone === "warning") {
    return <AlertTriangle aria-hidden="true" className="h-4 w-4" />;
  }
  return <CheckCircle2 aria-hidden="true" className="h-4 w-4" />;
}

export function DashboardStatusBanner() {
  const searchParams = useSearchParams();
  const activeToast = useMemo(() => {
    const error = searchParams.get("error") ?? "";
    const warning = searchParams.get("warning") ?? "";
    const message = searchParams.get("message") ?? "";

    if (error) return { tone: "error" as const, text: error };
    if (warning) return { tone: "warning" as const, text: warning };
    if (message) return { tone: "success" as const, text: message.includes("saved") ? `${message} \u2713` : message };
    return null;
  }, [searchParams]);

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const toastKey = activeToast ? `${activeToast.tone}:${activeToast.text}` : null;
  const visible = Boolean(activeToast && dismissedKey !== toastKey);

  useEffect(() => {
    if (!activeToast || !toastKey || dismissedKey === toastKey) {
      return;
    }
    const timer = window.setTimeout(() => setDismissedKey(toastKey), 4200);
    return () => window.clearTimeout(timer);
  }, [activeToast, dismissedKey, toastKey]);

  if (!activeToast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] w-[min(26rem,calc(100vw-2rem))]">
      <AnimatePresence>
        {visible ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${toastToneClasses(activeToast.tone)}`}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            role="status"
            transition={{ duration: 0.26, ease: "easeOut" }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/12">
                {toastToneIcon(activeToast.tone)}
              </span>
              <p className="text-sm font-medium leading-relaxed">{activeToast.text}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
