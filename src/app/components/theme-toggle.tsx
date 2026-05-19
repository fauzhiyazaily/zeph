"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // Track mount only to render the correct icon after hydration without mismatch.
  // The button itself is always enabled — clicking before hydration is harmless.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (resolvedTheme ?? "dark") : "dark";
  const isDark = currentTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const handleToggle = () => {
    const next = isDark ? "light" : "dark";
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : "theme-toggle"}
      aria-label={label}
      aria-pressed={isDark}
      onClick={handleToggle}
      title={label}
      suppressHydrationWarning
    >
      <span className="theme-toggle-icon" aria-hidden="true" suppressHydrationWarning>
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
      <span className="theme-toggle-label" suppressHydrationWarning>
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}

