import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateBudgetAlerts,
  getOrCreateBudgetAlertPreference,
  type BudgetAlertPreference,
} from "@/lib/budgets/alerts";
import type { BudgetUtilization } from "@/lib/budgets/utilization";

const logAuditEventMock = vi.fn();

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

function createPreference(overrides?: Partial<BudgetAlertPreference>): BudgetAlertPreference {
  return {
    user_id: "u1",
    alert_75_enabled: true,
    alert_100_enabled: true,
    in_app_enabled: true,
    push_enabled: true,
    email_enabled: false,
    updated_at: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

function createUtilization(pct: number): BudgetUtilization[] {
  return [
    {
      budget: {
        id: "b1",
        user_id: "u1",
        category: "Food",
        month: "2026-05",
        amount_limit: 1000,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      spent: 760,
      remaining: 240,
      pct,
      isOver: pct > 100,
      isNearLimit: pct >= 75,
    },
  ];
}

describe("getOrCreateBudgetAlertPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing preference when present", async () => {
    const existing = createPreference({ email_enabled: true });

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: existing });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: selectMock,
      }),
    };

    const result = await getOrCreateBudgetAlertPreference(supabase as never, "u1");

    expect(result).toEqual(existing);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("creates default preference when missing", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    const singleMock = vi.fn().mockResolvedValue({
      data: createPreference(),
    });
    const insertSelectMock = vi.fn().mockReturnValue({ single: singleMock });
    const upsertMock = vi.fn().mockReturnValue({ select: insertSelectMock });

    const supabase = {
      from: vi.fn(() => {
        if (supabase.from.mock.calls.length === 1) {
          return { select: selectMock };
        }
        return { upsert: upsertMock };
      }),
    };

    const result = await getOrCreateBudgetAlertPreference(supabase as never, "u1");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        alert_75_enabled: true,
        alert_100_enabled: true,
        in_app_enabled: true,
        push_enabled: true,
        email_enabled: false,
      }),
      { onConflict: "user_id" },
    );
    expect(result.user_id).toBe("u1");
  });
});

describe("evaluateBudgetAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches 75% and 100% alerts with configured channels", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: insertMock,
      }),
    };

    const result = await evaluateBudgetAlerts({
      supabase: supabase as never,
      userId: "u1",
      month: "2026-05",
      utilization: createUtilization(110),
      preference: createPreference({ email_enabled: true }),
    });

    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        threshold: 75,
        channels: {
          in_app: true,
          push: true,
          email: true,
        },
      }),
    );
    expect(insertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        threshold: 100,
      }),
    );
    expect(result.generatedCount).toBe(2);
    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
  });

  it("respects enabled thresholds and does not dispatch when below 75%", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: insertMock,
      }),
    };

    const belowThreshold = await evaluateBudgetAlerts({
      supabase: supabase as never,
      userId: "u1",
      month: "2026-05",
      utilization: createUtilization(74),
      preference: createPreference(),
    });

    const onlyHundred = await evaluateBudgetAlerts({
      supabase: supabase as never,
      userId: "u1",
      month: "2026-05",
      utilization: createUtilization(100),
      preference: createPreference({ alert_75_enabled: false, alert_100_enabled: true }),
    });

    expect(belowThreshold.generatedCount).toBe(0);
    expect(onlyHundred.generatedCount).toBe(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ threshold: 100 }));
  });

  it("prevents duplicate spam when DB unique threshold window conflict occurs", async () => {
    const insertMock = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: insertMock,
      }),
    };

    const result = await evaluateBudgetAlerts({
      supabase: supabase as never,
      userId: "u1",
      month: "2026-05",
      utilization: createUtilization(110),
      preference: createPreference(),
    });

    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(result.generatedCount).toBe(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
