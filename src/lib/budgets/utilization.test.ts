import { describe, expect, it, vi } from "vitest";
import { computeBudgetUtilization } from "@/lib/budgets/utilization";
import type { Budget } from "@/lib/budgets/budget-helpers";

type SpendRow = {
  category: string | null;
  amount: number;
};

function createSupabaseMock(rows: SpendRow[]) {
  const returnsMock = vi.fn().mockResolvedValue({ data: rows });
  const ltMock = vi.fn().mockReturnValue({ returns: returnsMock });
  const gteMock = vi.fn().mockReturnValue({ lt: ltMock });
  const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    supabase: {
      from: fromMock,
    },
    spies: {
      fromMock,
      selectMock,
      eqMock,
      gteMock,
      ltMock,
      returnsMock,
    },
  };
}

describe("computeBudgetUtilization", () => {
  it("recalculates utilization using current categories with case-insensitive matching", async () => {
    const budgets: Budget[] = [
      {
        id: "b-food",
        user_id: "u1",
        category: "Food",
        month: "2026-05",
        amount_limit: 1000,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "b-travel",
        user_id: "u1",
        category: "Travel",
        month: "2026-05",
        amount_limit: 1000,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ];

    const { supabase } = createSupabaseMock([
      { category: " food ", amount: 300 },
      { category: "Food", amount: 250 },
      { category: "travel", amount: 1200 },
      { category: null, amount: 99 },
    ]);

    const result = await computeBudgetUtilization(supabase as never, "u1", "2026-05", budgets);

    expect(result).toHaveLength(2);

    const food = result.find((row) => row.budget.id === "b-food");
    const travel = result.find((row) => row.budget.id === "b-travel");

    expect(food).toEqual(
      expect.objectContaining({
        spent: 550,
        remaining: 450,
        pct: 55,
        isOver: false,
        isNearLimit: false,
      }),
    );

    expect(travel).toEqual(
      expect.objectContaining({
        spent: 1200,
        remaining: 0,
        pct: 120,
        isOver: true,
        isNearLimit: true,
      }),
    );
  });

  it("uses month bounds and only returns budgets for the requested month", async () => {
    const budgets: Budget[] = [
      {
        id: "b-current",
        user_id: "u1",
        category: "Food",
        month: "2026-05",
        amount_limit: 2000,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "b-other-month",
        user_id: "u1",
        category: "Food",
        month: "2026-06",
        amount_limit: 3000,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    ];

    const { supabase, spies } = createSupabaseMock([{ category: "food", amount: 750 }]);
    const result = await computeBudgetUtilization(supabase as never, "u1", "2026-05", budgets);

    const expectedStart = new Date(2026, 4, 1).toISOString();
    const expectedEnd = new Date(2026, 5, 1).toISOString();

    expect(spies.fromMock).toHaveBeenCalledWith("transactions");
    expect(spies.selectMock).toHaveBeenCalledWith("category,amount");
    expect(spies.eqMock).toHaveBeenCalledWith("user_id", "u1");
    expect(spies.gteMock).toHaveBeenCalledWith("date", expectedStart);
    expect(spies.ltMock).toHaveBeenCalledWith("date", expectedEnd);

    expect(result).toHaveLength(1);
    expect(result[0]?.budget.id).toBe("b-current");
    expect(result[0]?.spent).toBe(750);
  });
});
