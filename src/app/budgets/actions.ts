"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateBudgetInput } from "@/lib/budgets/budget-helpers";

function parseCheckbox(formData: FormData, key: string) {
  return String(formData.get(key) ?? "") === "on";
}

export async function upsertBudget(formData: FormData) {
  enforceServerSecretPolicy();

  const category = String(formData.get("category") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const amountLimit = String(formData.get("amountLimit") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/budgets").trim();

  const validationError = validateBudgetInput({ category, month, amountLimit });
  if (validationError) {
    redirect(`${returnTo}?error=${encodeURIComponent(validationError)}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const limit = Number(amountLimit);

  const { error } = await supabase.from("budgets").upsert(
    {
      user_id: user.id,
      category: category.toLowerCase(),
      month,
      amount_limit: limit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,category,month" },
  );

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Failed to save budget. Try again.")}`);
  }

  revalidatePath("/budgets");
  redirect(`${returnTo}?message=${encodeURIComponent("Budget saved.")}`);
}

export async function deleteBudget(formData: FormData) {
  enforceServerSecretPolicy();

  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/budgets").trim();

  if (!budgetId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Missing budget identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Failed to delete budget.")}`);
  }

  revalidatePath("/budgets");
  redirect(`${returnTo}?message=${encodeURIComponent("Budget deleted.")}`);
}

export async function saveBudgetAlertPreferences(formData: FormData) {
  enforceServerSecretPolicy();

  const returnTo = String(formData.get("returnTo") ?? "/budgets").trim();

  const alert75Enabled = parseCheckbox(formData, "alert75Enabled");
  const alert100Enabled = parseCheckbox(formData, "alert100Enabled");
  const inAppEnabled = parseCheckbox(formData, "inAppEnabled");
  const pushEnabled = parseCheckbox(formData, "pushEnabled");
  const emailEnabled = parseCheckbox(formData, "emailEnabled");

  if (!alert75Enabled && !alert100Enabled) {
    redirect(`${returnTo}?error=${encodeURIComponent("Enable at least one threshold (75% or 100%).")}`);
  }

  if (!inAppEnabled && !pushEnabled && !emailEnabled) {
    redirect(`${returnTo}?error=${encodeURIComponent("Enable at least one alert channel.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase.from("budget_alert_preferences").upsert(
    {
      user_id: user.id,
      alert_75_enabled: alert75Enabled,
      alert_100_enabled: alert100Enabled,
      in_app_enabled: inAppEnabled,
      push_enabled: pushEnabled,
      email_enabled: emailEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Could not save alert preferences.")}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect(`${returnTo}?message=${encodeURIComponent("Alert preferences saved.")}`);
}
