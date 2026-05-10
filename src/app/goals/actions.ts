"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateGoalInput } from "@/lib/goals/goal-helpers";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveGoal(formData: FormData) {
  enforceServerSecretPolicy();

  const goalId = String(formData.get("goalId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmountRaw = String(formData.get("targetAmount") ?? "").trim();
  const currentAmountRaw = String(formData.get("currentAmount") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/goals").trim();

  const validationError = validateGoalInput({
    name,
    targetAmount: targetAmountRaw,
    currentAmount: currentAmountRaw,
    deadline,
    notes,
  });

  if (validationError) {
    redirect(`${returnTo}?error=${encodeURIComponent(validationError)}`);
  }

  const targetAmount = Number(targetAmountRaw);
  const currentAmount = Number(currentAmountRaw);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const row = {
    user_id: user.id,
    name,
    target_amount: Number(targetAmount.toFixed(2)),
    current_amount: Number(currentAmount.toFixed(2)),
    deadline,
    notes: notes.length > 0 ? notes : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = goalId
    ? await supabase.from("goals").update(row).eq("id", goalId).eq("user_id", user.id)
    : await supabase.from("goals").insert(row);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Could not save goal right now.")}`);
  }

  revalidatePath("/goals");
  revalidatePath("/goals/history");
  revalidatePath("/dashboard");
  redirect(`${returnTo}?message=${encodeURIComponent("Goal saved.")}`);
}

export async function archiveGoal(formData: FormData) {
  enforceServerSecretPolicy();

  const goalId = String(formData.get("goalId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/goals").trim();

  if (!goalId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Missing goal identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Could not archive goal.")}`);
  }

  revalidatePath("/goals");
  revalidatePath("/goals/history");
  revalidatePath("/dashboard");
  redirect(`${returnTo}?message=${encodeURIComponent("Goal archived.")}`);
}

export async function unarchiveGoal(formData: FormData) {
  enforceServerSecretPolicy();

  const goalId = String(formData.get("goalId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/goals/history").trim();

  if (!goalId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Missing goal identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("goals")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Could not unarchive goal.")}`);
  }

  revalidatePath("/goals");
  revalidatePath("/goals/history");
  revalidatePath("/dashboard");
  redirect(`${returnTo}?message=${encodeURIComponent("Goal restored.")}`);
}

export async function deleteGoal(formData: FormData) {
  enforceServerSecretPolicy();

  const goalId = String(formData.get("goalId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/goals").trim();

  if (!goalId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Missing goal identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent("Could not delete goal.")}`);
  }

  revalidatePath("/goals");
  revalidatePath("/goals/history");
  revalidatePath("/dashboard");
  redirect(`${returnTo}?message=${encodeURIComponent("Goal deleted.")}`);
}
