import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget } from "@/lib/budgets/budget-helpers";

export type BudgetUtilization = {
  budget: Budget;
  spent: number;
  remaining: number;
  /** 0-100+ (can exceed 100 when over budget) */
  pct: number;
  isOver: boolean;
  isNearLimit: boolean; // >= 75%
};

type SpendRow = {
  category: string | null;
  amount: number;
};

/**
 * For a given user, month key (YYYY-MM), and budget list, compute
 * utilization by summing transaction amounts per category.
 *
 * Pass `supabase` as a server-side client (never public).
 */
export async function computeBudgetUtilization(
  supabase: SupabaseClient,
  userId: string,
  month: string,
  budgets: Budget[],
): Promise<BudgetUtilization[]> {
  if (budgets.length === 0) return [];

  // Date range for the month
  const [year, mo] = month.split("-").map(Number);
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 1); // exclusive upper bound

  const { data: rows } = await supabase
    .from("transactions")
    .select("category,amount")
    .eq("user_id", userId)
    .gte("date", start.toISOString())
    .lt("date", end.toISOString())
    .returns<SpendRow[]>();

  // Aggregate spend per category (lowercase match)
  const spendMap = new Map<string, number>();
  for (const row of rows ?? []) {
    const cat = (row.category?.trim() ?? "uncategorized").toLowerCase();
    spendMap.set(cat, (spendMap.get(cat) ?? 0) + row.amount);
  }

  return budgets
    .filter((b) => b.month === month)
    .map((budget) => {
      const cat = budget.category.toLowerCase();
      const spent = spendMap.get(cat) ?? 0;
      const limit = Number(budget.amount_limit);
      const remaining = Math.max(0, limit - spent);
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return {
        budget,
        spent,
        remaining,
        pct,
        isOver: spent > limit,
        isNearLimit: pct >= 75,
      };
    });
}
