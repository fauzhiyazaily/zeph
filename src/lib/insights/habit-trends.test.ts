import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHabitTrendInsights, type ClassifiedTransaction } from "./habit-trends";

function buildRow(
  id: string,
  daysAgo: number,
  aiClassification: "wise" | "useless",
  amount: number,
  category: string | null,
): ClassifiedTransaction {
  const at = new Date(Date.UTC(2026, 4, 22 - daysAgo, 12, 0, 0));
  return {
    id,
    amount,
    date: at.toISOString(),
    category,
    aiClassification,
  };
}

describe("buildHabitTrendInsights", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns insufficient history when total classified rows are below threshold", () => {
    const rows = [
      buildRow("t1", 1, "useless", 200, "Food"),
      buildRow("t2", 2, "wise", 500, "Salary"),
      buildRow("t3", 3, "useless", 150, "Snacks"),
      buildRow("t4", 4, "wise", 400, "Fuel"),
      buildRow("t5", 5, "useless", 120, "Taxi"),
    ];

    const result = buildHabitTrendInsights(rows);

    expect(result.isSufficientHistory).toBe(false);
    expect(result.insights).toHaveLength(0);
    expect(result.sampleSize).toBe(5);
  });

  it("returns insufficient history when recent period does not have enough classified rows", () => {
    const rows = [
      buildRow("t1", 40, "useless", 200, "Food"),
      buildRow("t2", 41, "wise", 500, "Salary"),
      buildRow("t3", 42, "useless", 150, "Snacks"),
      buildRow("t4", 43, "wise", 400, "Fuel"),
      buildRow("t5", 44, "useless", 120, "Taxi"),
      buildRow("t6", 45, "wise", 280, "Travel"),
    ];

    const result = buildHabitTrendInsights(rows);

    expect(result.isSufficientHistory).toBe(false);
    expect(result.insights).toHaveLength(0);
    expect(result.sampleSize).toBe(6);
  });

  it("builds periodic trend summaries by category and frequency", () => {
    const rows = [
      buildRow("t1", 3, "useless", 450, "Dining"),
      buildRow("t2", 5, "useless", 300, "Dining"),
      buildRow("t3", 9, "useless", 200, "Shopping"),
      buildRow("t4", 12, "wise", 800, "Utilities"),
      buildRow("t5", 16, "wise", 500, "Transport"),
      buildRow("t6", 18, "useless", 150, "Dining"),
      buildRow("t7", 34, "useless", 120, "Dining"),
      buildRow("t8", 38, "wise", 220, "Fuel"),
    ];

    const result = buildHabitTrendInsights(rows);

    expect(result.isSufficientHistory).toBe(true);
    expect(result.periodLabel).toBe("Last 30 days");
    expect(result.insights).toHaveLength(3);
    expect(result.insights[0].title).toContain("Dining");
    expect(result.insights[0].text).toContain("transactions were marked useless");
    expect(result.insights[1].title).toBe("Wise vs useless trend");
  });

  it("sanitizes category labels before rendering insight copy", () => {
    const rows = [
      buildRow("t1", 2, "useless", 450, "<script>alert(1)</script>"),
      buildRow("t2", 4, "useless", 300, "<script>alert(1)</script>"),
      buildRow("t3", 6, "wise", 200, "Salary"),
      buildRow("t4", 8, "wise", 900, "Salary"),
      buildRow("t5", 10, "useless", 110, "<script>alert(1)</script>"),
      buildRow("t6", 12, "wise", 700, "Rent"),
    ];

    const result = buildHabitTrendInsights(rows);

    expect(result.isSufficientHistory).toBe(true);
    expect(result.insights[0].title).not.toContain("<script>");
    expect(result.insights[0].title).not.toContain("alert(1)");
    expect(result.insights[0].text).not.toContain("<script>");
  });
});
