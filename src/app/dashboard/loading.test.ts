import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/components/app-shell", () => ({
  AppShell: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "app-shell" }, children),
}));

describe("dashboard loading state", () => {
  it("renders summary loading placeholders", async () => {
    const { default: DashboardLoading } = await import("@/app/dashboard/loading");
    const html = renderToStaticMarkup(createElement(DashboardLoading));

    expect(html).toContain("Loading dashboard insights...");
    expect(html).toContain("animate-pulse");
  });
});
