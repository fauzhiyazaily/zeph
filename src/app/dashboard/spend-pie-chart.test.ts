import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpendPieChart } from "@/app/dashboard/spend-pie-chart";

describe("spend pie chart", () => {
  it("renders category amounts and total from breakdown", () => {
    const html = renderToStaticMarkup(
      createElement(SpendPieChart, {
        breakdown: [
          { category: "Food", amount: 1250 },
          { category: "Bills", amount: 750 },
        ],
        wafflePalette: {
          Food: "#fbbf24",
          Bills: "#818cf8",
        },
      }),
    );

    expect(html).toContain("INR 2000");
    expect(html).toContain("Food");
    expect(html).toContain("Bills");
    expect(html).toContain("INR 1250.00");
  });

  it("renders fallback state and touch-ready container when no positive spend exists", () => {
    const html = renderToStaticMarkup(
      createElement(SpendPieChart, {
        breakdown: [{ category: "Food", amount: 0 }],
        wafflePalette: {},
      }),
    );

    expect(html).toContain("No spend");
    expect(html).toContain("touch-manipulation");
  });
});