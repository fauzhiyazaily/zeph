"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VALID_SOURCES = new Set(["upi", "card", "wallet", "bank", "unknown"]);
const VALID_CLASSIFICATIONS = new Set(["wise", "useless"]);
const VALID_RECOMMENDATION_ACTIONS = new Set(["accepted", "dismissed"]);

function toRedirectParam(value: string) {
  return encodeURIComponent(value);
}

function parseCategory(formData: FormData) {
  const category = String(formData.get("category") ?? "").trim();
  if (category.length < 2 || category.length > 40) {
    return null;
  }
  return category;
}

function parseSelectedTransactionIds(formData: FormData) {
  return formData
    .getAll("transactionIds")
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

export async function assignTransactionCategory(formData: FormData) {
  enforceServerSecretPolicy();

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const category = parseCategory(formData);

  if (!transactionId) {
    redirect("/dashboard?error=Missing%20transaction%20identifier.");
  }

  if (!category) {
    redirect("/dashboard?error=Category%20must%20be%202-40%20characters.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("transactions")
    .update({ category })
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (error) {
    redirect("/dashboard?error=Failed%20to%20update%20category.");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?message=Category%20updated.");
}

export async function bulkAssignTransactionCategory(formData: FormData) {
  enforceServerSecretPolicy();

  const category = parseCategory(formData);
  const selectedTransactionIds = parseSelectedTransactionIds(formData);

  if (!category) {
    redirect("/dashboard?error=Bulk%20category%20must%20be%202-40%20characters.");
  }

  if (selectedTransactionIds.length === 0) {
    redirect("/dashboard?error=Select%20at%20least%20one%20transaction%20for%20bulk%20update.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: scopedRows, error: scopeError } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .in("id", selectedTransactionIds)
    .returns<Array<{ id: string }>>();

  if (scopeError) {
    redirect("/dashboard?error=Could%20not%20validate%20selection%20scope.%20Retry.");
  }

  const scopedIds = (scopedRows ?? []).map((row) => row.id);

  if (scopedIds.length === 0) {
    redirect(
      "/dashboard?error=No%20selected%20transactions%20belong%20to%20your%20account.%20Refresh%20and%20try%20again.",
    );
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ category })
    .eq("user_id", user.id)
    .in("id", scopedIds);

  if (updateError) {
    redirect("/dashboard?error=Bulk%20update%20failed.%20Retry%20in%20a%20moment.");
  }

  const skippedCount = selectedTransactionIds.length - scopedIds.length;

  logAuditEvent({
    event: "transactions_bulk_category_updated",
    userId: user.id,
    route: "/dashboard",
    metadata: {
      updatedCount: scopedIds.length,
      skippedCount,
      category,
    },
  });

  revalidatePath("/dashboard");

  if (skippedCount > 0) {
    redirect(
      `/dashboard?warning=${toRedirectParam(
        `Updated ${scopedIds.length} transactions. ${skippedCount} skipped because they were unavailable or out of scope. Re-select and retry if needed.`,
      )}`,
    );
  }

  redirect(`/dashboard?message=${toRedirectParam(`Updated ${scopedIds.length} transactions.`)}`);
}

export async function editTransactionDetails(formData: FormData) {
  enforceServerSecretPolicy();

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const merchant = String(formData.get("merchant") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const source = String(formData.get("source") ?? "unknown").trim().toLowerCase();
  const referenceRaw = String(formData.get("reference") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();

  if (!transactionId) {
    redirect("/dashboard?error=Missing%20transaction%20identifier.");
  }

  if (merchant.length < 2 || merchant.length > 120) {
    redirect("/dashboard?error=Merchant%20must%20be%202-120%20characters.");
  }

  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/dashboard?error=Amount%20must%20be%20a%20positive%20number.");
  }

  if (!VALID_SOURCES.has(source)) {
    redirect("/dashboard?error=Source%20must%20be%20one%20of%20UPI%2C%20card%2C%20wallet%2C%20bank%2C%20unknown.");
  }

  const parsedDate = new Date(dateRaw);
  if (Number.isNaN(parsedDate.getTime())) {
    redirect("/dashboard?error=Date%20must%20be%20valid.");
  }

  const category = categoryRaw.length === 0 ? null : categoryRaw;
  if (category && (category.length < 2 || category.length > 40)) {
    redirect("/dashboard?error=Category%20must%20be%202-40%20characters%20when%20provided.");
  }

  const reference = referenceRaw.length === 0 ? null : referenceRaw;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: updatedRows, error } = await supabase
    .from("transactions")
    .update({
      merchant,
      amount: Number(amount.toFixed(2)),
      source,
      reference,
      category,
      date: parsedDate.toISOString(),
    })
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    redirect("/dashboard?error=Failed%20to%20save%20transaction%20edits.%20Retry.");
  }

  if (!updatedRows || updatedRows.length === 0) {
    redirect(
      "/dashboard?error=Transaction%20could%20not%20be%20updated.%20It%20may%20be%20out%20of%20scope%20or%20no%20longer%20available.",
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?message=Transaction%20details%20updated.");
}

export async function reviewTransactionClassification(formData: FormData) {
  enforceServerSecretPolicy();

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim().toLowerCase();
  const label = String(formData.get("label") ?? "").trim().toLowerCase();
  const reasonInput = String(formData.get("reason") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/transactions").trim();

  if (!transactionId) {
    redirect(`${returnTo}?error=Missing%20transaction%20identifier.`);
  }

  if (decision !== "accept" && decision !== "override") {
    redirect(`${returnTo}?error=Invalid%20classification%20decision.`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: existingRow, error: fetchError } = await supabase
    .from("transactions")
    .select("id,ai_classification,ai_reason")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle<{
      id: string;
      ai_classification: "wise" | "useless" | null;
      ai_reason: string | null;
    }>();

  if (fetchError || !existingRow) {
    redirect(
      `${returnTo}?error=Transaction%20not%20found%20or%20out%20of%20scope.%20Refresh%20and%20retry.`,
    );
  }

  if (decision === "accept") {
    const { error: acceptError } = await supabase
      .from("transactions")
      .update({
        ai_user_classification: null,
        ai_user_reason: null,
        ai_review_state: "accepted",
        ai_override_at: null,
      })
      .eq("id", transactionId)
      .eq("user_id", user.id);

    if (acceptError) {
      redirect(`${returnTo}?error=Failed%20to%20save%20classification%20review.`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    redirect(`${returnTo}?message=AI%20classification%20accepted.`);
  }

  if (!VALID_CLASSIFICATIONS.has(label)) {
    redirect(`${returnTo}?error=Override%20label%20must%20be%20wise%20or%20useless.`);
  }

  const reason = reasonInput.length > 0 ? reasonInput : "User override applied.";
  if (reason.length < 8 || reason.length > 240) {
    redirect(`${returnTo}?error=Override%20reason%20must%20be%208-240%20characters.`);
  }

  const { error: overrideError } = await supabase
    .from("transactions")
    .update({
      ai_user_classification: label,
      ai_user_reason: reason,
      ai_classification: label,
      ai_reason: reason,
      ai_review_state: "overridden",
      ai_override_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (overrideError) {
    redirect(`${returnTo}?error=Failed%20to%20save%20classification%20override.`);
  }

  logAuditEvent({
    event: "classification_overridden",
    userId: user.id,
    route: returnTo,
    metadata: {
      transactionId,
      label,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  redirect(`${returnTo}?message=Classification%20override%20saved.`);
}

export async function saveRecommendationAction(formData: FormData) {
  enforceServerSecretPolicy();

  const category = String(formData.get("category") ?? "").trim().toLowerCase();
  const periodKey = String(formData.get("periodKey") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim().toLowerCase();

  if (!category || category.length > 60) {
    redirect("/dashboard?error=Invalid%20recommendation%20category.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    redirect("/dashboard?error=Invalid%20period%20key%20format.");
  }

  if (!VALID_RECOMMENDATION_ACTIONS.has(action)) {
    redirect("/dashboard?error=Invalid%20recommendation%20action.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase.from("recommendation_actions").upsert(
    {
      user_id: user.id,
      category,
      period_key: periodKey,
      action,
    },
    { onConflict: "user_id,category,period_key" },
  );

  if (error) {
    redirect("/dashboard?error=Failed%20to%20save%20recommendation%20action.");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
