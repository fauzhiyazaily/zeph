import type { SupabaseClient } from "@supabase/supabase-js";

type UserIncomePreferenceRow = {
  user_id: string;
  balance_target: number | null;
  updated_at: string;
};

/**
 * Returns the user's stored balance target, or null if not yet set.
 * Callers should fall back to a formula when this returns null.
 */
export async function getBalanceTarget(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("user_income_preferences")
    .select("balance_target")
    .eq("user_id", userId)
    .maybeSingle<Pick<UserIncomePreferenceRow, "balance_target">>();

  if (error) {
    console.error("[getBalanceTarget] query failed:", error.message);
  }

  return data?.balance_target ?? null;
}
