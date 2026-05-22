import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalProgress } from "@/lib/goals/progress";
import { evaluateGoalMilestones } from "@/lib/goals/milestones";

const logAuditEventMock = vi.fn();

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

type InsertPayload = {
  user_id: string;
  goal_id: string;
  milestone: 25 | 50 | 75 | 100;
  progress_percent: number;
  message: string;
};

function createSupabaseStub(input: {
  shouldConflict?: (payload: InsertPayload) => boolean;
}) {
  const insert = vi.fn(async (payload: InsertPayload) => {
    if (input.shouldConflict?.(payload)) {
      return { error: { code: "23505" } };
    }
    return { error: null };
  });

  return {
    from: vi.fn().mockReturnValue({ insert }),
    insert,
  };
}

function createProgressRow(percent: number): GoalProgress {
  return {
    goal: {
      id: "goal-1",
      user_id: "user-1",
      name: "Emergency Fund",
      target_amount: 100000,
      current_amount: 75000,
      deadline: "2026-12-31",
      notes: null,
      archived_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-05-22T00:00:00.000Z",
    },
    percent,
    remaining: Math.max(0, 100000 - percent * 1000),
    isCompleted: percent >= 100,
    daysRemaining: 30,
    requiredPerDay: 0,
    statusLabel: percent >= 100 ? "Completed" : "On track",
  };
}

describe("evaluateGoalMilestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates celebration notifications once for reached milestones", async () => {
    const supabase = createSupabaseStub({});
    const row = createProgressRow(76);

    const result = await evaluateGoalMilestones({
      supabase: supabase as never,
      userId: "user-1",
      rows: [row],
    });

    const insertPayloads = supabase.insert.mock.calls.map((call) => call[0] as InsertPayload);
    expect(result.generatedCount).toBe(3);
    expect(insertPayloads.map((payload) => payload.milestone)).toEqual([25, 50, 75]);
    expect(logAuditEventMock).toHaveBeenCalledTimes(3);
  });

  it("does not duplicate milestone notifications on repeated runs", async () => {
    const seen = new Set<string>();
    const supabase = createSupabaseStub({
      shouldConflict: (payload) => {
        const key = `${payload.goal_id}:${payload.milestone}`;
        if (seen.has(key)) {
          return true;
        }
        seen.add(key);
        return false;
      },
    });

    const row = createProgressRow(100);

    const firstRun = await evaluateGoalMilestones({
      supabase: supabase as never,
      userId: "user-1",
      rows: [row],
    });

    const secondRun = await evaluateGoalMilestones({
      supabase: supabase as never,
      userId: "user-1",
      rows: [row],
    });

    expect(firstRun.generatedCount).toBe(4);
    expect(secondRun.generatedCount).toBe(0);
    expect(logAuditEventMock).toHaveBeenCalledTimes(4);
  });
});