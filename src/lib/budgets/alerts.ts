import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "@/lib/audit";
import type { BudgetUtilization } from "@/lib/budgets/utilization";

export type BudgetAlertPreference = {
  user_id: string;
  alert_75_enabled: boolean;
  alert_100_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  updated_at: string;
};

export type BudgetAlertRow = {
  id: string;
  user_id: string;
  budget_id: string;
  month: string;
  threshold: 75 | 100;
  spent_amount: number;
  budget_limit: number;
  channels: Record<string, boolean>;
  message: string;
  created_at: string;
};

function defaultPreference(userId: string): Omit<BudgetAlertPreference, "updated_at"> {
  return {
    user_id: userId,
    alert_75_enabled: true,
    alert_100_enabled: true,
    in_app_enabled: true,
    push_enabled: true,
    email_enabled: false,
  };
}

export async function getOrCreateBudgetAlertPreference(
  supabase: SupabaseClient,
  userId: string,
): Promise<BudgetAlertPreference> {
  const { data: existing } = await supabase
    .from("budget_alert_preferences")
    .select("user_id,alert_75_enabled,alert_100_enabled,in_app_enabled,push_enabled,email_enabled,updated_at")
    .eq("user_id", userId)
    .maybeSingle<BudgetAlertPreference>();

  if (existing) {
    return existing;
  }

  const { data } = await supabase
    .from("budget_alert_preferences")
    .upsert(
      {
        ...defaultPreference(userId),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,alert_75_enabled,alert_100_enabled,in_app_enabled,push_enabled,email_enabled,updated_at")
    .single<BudgetAlertPreference>();

  return (
    data ?? {
      ...defaultPreference(userId),
      updated_at: new Date().toISOString(),
    }
  );
}

export async function evaluateBudgetAlerts(input: {
  supabase: SupabaseClient;
  userId: string;
  month: string;
  utilization: BudgetUtilization[];
  preference?: BudgetAlertPreference;
}): Promise<{ preference: BudgetAlertPreference; generatedCount: number }> {
  const preference = input.preference
    ? input.preference
    : await getOrCreateBudgetAlertPreference(input.supabase, input.userId);

  const thresholds: Array<{ value: 75 | 100; enabled: boolean }> = [
    { value: 75, enabled: preference.alert_75_enabled },
    { value: 100, enabled: preference.alert_100_enabled },
  ];

  const channels = {
    in_app: preference.in_app_enabled,
    push: preference.push_enabled,
    email: preference.email_enabled,
  };

  let generatedCount = 0;

  for (const row of input.utilization) {
    for (const threshold of thresholds) {
      if (!threshold.enabled || row.pct < threshold.value) {
        continue;
      }

      const message =
        threshold.value === 100
          ? `${row.budget.category} crossed 100% budget usage for ${input.month}.`
          : `${row.budget.category} reached 75% budget usage for ${input.month}.`;

      const { error } = await input.supabase.from("budget_alerts").insert({
        user_id: input.userId,
        budget_id: row.budget.id,
        month: input.month,
        threshold: threshold.value,
        spent_amount: Number(row.spent.toFixed(2)),
        budget_limit: Number(row.budget.amount_limit),
        channels,
        message,
      });

      if (error) {
        if (error.code === "23505") {
          continue;
        }
        continue;
      }

      generatedCount += 1;

      logAuditEvent({
        event: "budget_alert_triggered",
        userId: input.userId,
        route: "/dashboard",
        metadata: {
          budgetId: row.budget.id,
          category: row.budget.category,
          month: input.month,
          threshold: threshold.value,
          channels,
        },
      });
    }
  }

  return { preference, generatedCount };
}
