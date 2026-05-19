"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

type AppThemeProviderProps = {
  children: ReactNode;
};

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      enableColorScheme
      storageKey="zeph-theme"
      themes={["light", "dark"]}
      disableTransitionOnChange={false}
    >
      {children}
    </ThemeProvider>
  );
}
