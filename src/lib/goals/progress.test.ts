import { describe, expect, it } from "vitest";
import { computeGoalProgress, summarizeGoalProgress } from "@/lib/goals/progress";
import type { Goal } from "@/lib/goals/goal-helpers";

function goal(overrides?: Partial<Goal>): Goal {
  return {
    id: "g1",
    user_id: "u1",
    name: "Emergency Fund",
    target_amount: 100000,
    current_amount: 25000,
    deadline: "2026-12-31",
    notes: null,
    archived_at: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeGoalProgress", () => {
  it("calculates percent, remaining, and projection from current goal data", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const result = computeGoalProgress(goal(), now);

    expect(result.percent).toBe(25);
    expect(result.remaining).toBe(75000);
    expect(result.isCompleted).toBe(false);
    expect(result.statusLabel).toBe("On track");
    expect(result.requiredPerDay).toBeGreaterThan(0);
  });

  it("updates projection/trend indicators consistently as source values change", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");

    const baseline = computeGoalProgress(goal({ current_amount: 10000 }), now);
    const updated = computeGoalProgress(goal({ current_amount: 50000 }), now);

    expect(updated.percent).toBeGreaterThan(baseline.percent);
    expect(updated.remaining).toBeLessThan(baseline.remaining);
    expect(updated.requiredPerDay).toBeLessThan(baseline.requiredPerDay);
  });

  it("returns completed, due soon, and past deadline states correctly", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");

    const completed = computeGoalProgress(goal({ current_amount: 100000 }), now);
    const dueSoon = computeGoalProgress(goal({ deadline: "2026-06-25", current_amount: 1000 }), now);
    const pastDeadline = computeGoalProgress(goal({ deadline: "2026-06-10", current_amount: 1000 }), now);

    expect(completed.statusLabel).toBe("Completed");
    expect(dueSoon.statusLabel).toBe("Due soon");
    expect(pastDeadline.statusLabel).toBe("Past deadline");
  });
});

describe("summarizeGoalProgress", () => {
  it("summarizes totals, completion, average progress, and due-soon counts", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");

    const rows = [
      computeGoalProgress(goal({ id: "g1", current_amount: 100000 }), now),
      computeGoalProgress(goal({ id: "g2", deadline: "2026-06-24", current_amount: 1000 }), now),
      computeGoalProgress(goal({ id: "g3", deadline: "2026-07-30", current_amount: 50000 }), now),
    ];

    const summary = summarizeGoalProgress(rows);

    expect(summary.totalGoals).toBe(3);
    expect(summary.completedGoals).toBe(1);
    expect(summary.avgProgress).toBe(Math.round((100 + 1 + 50) / 3));
    expect(summary.dueSoonCount).toBe(1);
  });
});
