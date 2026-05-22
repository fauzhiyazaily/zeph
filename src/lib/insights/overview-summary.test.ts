import { describe, expect, it } from "vitest";
import { buildWeeklyTrendData, computeWeekSpendComparison, sumSpend } from "@/lib/insights/overview-summary";

describe("overview summary helpers", () => {
  it("sums spend rows safely", () => {
    const total = sumSpend([
      { amount: 100, date: "2026-05-21T00:00:00.000Z" },
      { amount: 250.5, date: "2026-05-22T00:00:00.000Z" },
    ]);

    expect(total).toBe(350.5);
  });

  it("computes week-over-week spend deltas", () => {
    const now = new Date("2026-05-22T00:00:00.000Z");
    const rows = [
      { amount: 100, date: "2026-05-21T00:00:00.000Z" },
      { amount: 200, date: "2026-05-20T00:00:00.000Z" },
      { amount: 50, date: "2026-05-14T00:00:00.000Z" },
      { amount: 100, date: "2026-05-13T00:00:00.000Z" },
    ];

    const result = computeWeekSpendComparison(rows, now);

    expect(result.thisWeekTotal).toBe(300);
    expect(result.lastWeekTotal).toBe(150);
    expect(result.weekSpendDeltaAbs).toBe(150);
    expect(result.weekSpendDeltaPct).toBe(100);
  });

  it("builds seven-day trend points with aggregated spend", () => {
    const chartWindowEnd = new Date("2026-05-22T00:00:00.000Z");
    const rows = [
      { amount: 100, date: "2026-05-15T08:00:00.000Z" },
      { amount: 75, date: "2026-05-19T10:00:00.000Z" },
      { amount: 25, date: "2026-05-19T18:00:00.000Z" },
      { amount: 999, date: "2026-05-10T00:00:00.000Z" },
    ];

    const trend = buildWeeklyTrendData(rows, chartWindowEnd);

    expect(trend).toHaveLength(7);
    expect(trend[0].amount).toBe(100);
    expect(trend[4].amount).toBe(100);
    expect(trend.reduce((sum, row) => sum + row.amount, 0)).toBe(200);
  });
});