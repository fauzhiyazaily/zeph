"use client";

import { useEffect, useState } from "react";

type DebugState = {
  resolvedTheme: string | null;
  stored: string | null;
  htmlAttr: string | null;
};

export function ThemeDebug() {
  const [debug, setDebug] = useState<DebugState>({
    resolvedTheme: null,
    stored: null,
    htmlAttr: null,
  });

  useEffect(() => {
    const check = () => {
      setDebug({
        resolvedTheme: typeof window !== "undefined" ? document.documentElement.dataset.theme || "UNSET" : "SSR",
        stored: typeof window !== "undefined" ? localStorage.getItem("zeph-theme") || "EMPTY" : "SSR",
        htmlAttr: typeof window !== "undefined" ? document.documentElement.getAttribute("data-theme") || "NONE" : "SSR",
      });
    };

    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        zIndex: 999,
        background: "rgba(0,0,0,0.9)",
        color: "#0f0",
        padding: "0.5rem",
        fontSize: "0.7rem",
        fontFamily: "monospace",
        maxWidth: "200px",
        borderRadius: "4px",
        border: "1px solid #0f0",
      }}
    >
      <div>data-theme={debug.htmlAttr}</div>
      <div>localStorage={debug.stored}</div>
      <div>resolved={debug.resolvedTheme}</div>
    </div>
  );
}
