import { describe, expect, it } from "vitest";
import { buildCategoryBreakdown, buildWaffleCells } from "@/lib/insights/category-breakdown";

describe("category breakdown helpers", () => {
  it("builds category totals only for the selected period window", () => {
    const rows = [
      { amount: 100, category: "Food", date: "2026-05-10T00:00:00.000Z" },
      { amount: 150, category: "Food", date: "2026-05-11T00:00:00.000Z" },
      { amount: 200, category: "Bills", date: "2026-05-12T00:00:00.000Z" },
      { amount: 999, category: "Shopping", date: "2026-04-30T00:00:00.000Z" },
    ];

    const start = new Date("2026-05-10T00:00:00.000Z");
    const end = new Date("2026-05-13T00:00:00.000Z");
    const result = buildCategoryBreakdown(rows, start, end);

    expect(result).toEqual([
      { category: "Food", amount: 250 },
      { category: "Bills", amount: 200 },
    ]);
  });

  it("groups lower-ranked categories into Other when max categories is exceeded", () => {
    const rows = [
      { amount: 90, category: "Food", date: "2026-05-10T00:00:00.000Z" },
      { amount: 80, category: "Bills", date: "2026-05-10T00:00:00.000Z" },
      { amount: 70, category: "Transport", date: "2026-05-10T00:00:00.000Z" },
      { amount: 60, category: "Groceries", date: "2026-05-10T00:00:00.000Z" },
      { amount: 50, category: "Shopping", date: "2026-05-10T00:00:00.000Z" },
      { amount: 40, category: "Health", date: "2026-05-10T00:00:00.000Z" },
    ];

    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-06-01T00:00:00.000Z");
    const result = buildCategoryBreakdown(rows, start, end, 4);

    expect(result).toEqual([
      { category: "Food", amount: 90 },
      { category: "Bills", amount: 80 },
      { category: "Transport", amount: 70 },
      { category: "Groceries", amount: 60 },
      { category: "Other", amount: 90 },
    ]);
  });

  it("builds a bounded waffle distribution totaling requested cells", () => {
    const cells = buildWaffleCells([
      { category: "Food", amount: 70 },
      { category: "Bills", amount: 30 },
    ], 20);

    expect(cells).toHaveLength(20);
    const byCategory = cells.reduce<Record<string, number>>((acc, row) => {
      acc[row.category] = (acc[row.category] ?? 0) + 1;
      return acc;
    }, {});

    expect(byCategory.Food).toBeGreaterThan(byCategory.Bills);
  });
});