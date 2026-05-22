"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateGoalInput } from "@/lib/goals/goal-helpers";
import { isGoalArchived, isGoalCompleted, isGoalPastDeadline } from "@/lib/goals/history";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseReturnTo(formData: FormData, fallback = "/goals") {
  const value = String(formData.get("returnTo") ?? fallback).trim();
  return value.startsWith("/") ? value : fallback;
}

export async function saveGoal(formData: FormData) {
  enforceServerSecretPolicy();

  const goalId = String(formData.get("goalId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmountRaw = String(formData.get("targetAmount") ?? "").trim();
  const currentAmountRaw = String(formData.get("currentAmount") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const returnTo = parseReturnTo(formData);

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

  if (goalId) {
    const { data: existingGoal, error: existingGoalError } = await supabase
      .from("goals")
      .select("id,user_id,name,target_amount,current_amount,deadline,notes,archived_at,created_at,updated_at")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingGoalError || !existingGoal) {
      redirect(`${returnTo}?error=${encodeURIComponent("Goal not found.")}`);
    }

    const isHistorical = isGoalArchived(existingGoal)
      || isGoalCompleted(existingGoal)
      || isGoalPastDeadline(existingGoal);

    if (isHistorical) {
      const immutableFieldChanged =
        existingGoal.name !== name
        || Number(existingGoal.target_amount) !== row.target_amount
        || Number(existingGoal.current_amount) !== row.current_amount
        || existingGoal.deadline !== deadline;

      if (immutableFieldChanged) {
        redirect(`${returnTo}?error=${encodeURIComponent("Historical goals are immutable. Only notes can be updated.")}`);
      }

      const { error } = await supabase
        .from("goals")
        .update({ notes: row.notes, updated_at: row.updated_at })
        .eq("id", goalId)
        .eq("user_id", user.id);

      if (error) {
        redirect(`${returnTo}?error=${encodeURIComponent("Could not save goal right now.")}`);
      }

      revalidatePath("/goals");
      revalidatePath("/goals/history");
      revalidatePath("/dashboard");
      redirect(`${returnTo}?message=${encodeURIComponent("Goal notes updated.")}`);
    }
  }

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
  const returnTo = parseReturnTo(formData);

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
  const returnTo = parseReturnTo(formData, "/goals/history");

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
  const returnTo = parseReturnTo(formData);

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
