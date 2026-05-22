"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const currentTheme = mounted ? (resolvedTheme ?? "dark") : "dark";
  const isDark = currentTheme === "dark";
  const label = isDark ? "Dark mode \u2014 switch to light" : "Light mode \u2014 switch to dark";

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
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
      <span className="theme-toggle-label" suppressHydrationWarning>
        {isDark ? "Dark mode" : "Light mode"}
      </span>
    </button>
  );
}

