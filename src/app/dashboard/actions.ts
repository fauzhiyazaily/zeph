"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyzeBankStatement } from "@/lib/ai/bank-statement-analysis";
import { logAuditEvent } from "@/lib/audit";
import { classifyTransaction } from "@/lib/ai/classification";
import type { ParsedBankStatement, ParsedStatementTransaction } from "@/lib/ingestion/bank-statement-types";
import { writeIngestionAuditLog } from "@/lib/ingestion/audit-log";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { persistTransaction } from "@/lib/transactions/persistence";

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

function parseReturnTo(formData: FormData, fallback = "/dashboard") {
  const value = String(formData.get("returnTo") ?? fallback).trim();
  return value.startsWith("/") ? value : fallback;
}

export async function createManualExpense(formData: FormData) {
  enforceServerSecretPolicy();
  const startedAt = Date.now();

  const returnTo = parseReturnTo(formData);
  const merchant = String(formData.get("merchant") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const source = String(formData.get("source") ?? "unknown").trim().toLowerCase();
  const referenceRaw = String(formData.get("reference") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();

  if (merchant.length < 2 || merchant.length > 120) {
    redirect(`${returnTo}?error=${toRedirectParam("Merchant must be 2-120 characters.")}`);
  }

  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`${returnTo}?error=${toRedirectParam("Amount must be a positive number.")}`);
  }

  if (!VALID_SOURCES.has(source)) {
    redirect(
      `${returnTo}?error=${toRedirectParam("Source must be one of UPI, card, wallet, bank, unknown.")}`,
    );
  }

  const parsedDate = new Date(dateRaw);
  if (Number.isNaN(parsedDate.getTime())) {
    redirect(`${returnTo}?error=${toRedirectParam("Date must be valid.")}`);
  }

  const category = categoryRaw.length === 0 ? null : categoryRaw;
  if (category && (category.length < 2 || category.length > 40)) {
    redirect(
      `${returnTo}?error=${toRedirectParam(
        "Category must be 2-40 characters when provided.",
      )}`,
    );
  }

  const reference = referenceRaw.length === 0 ? null : referenceRaw;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const ingestionId = `manual:${user.id}:${Date.now()}:${randomUUID()}`;

  const persisted = await persistTransaction(supabase, {
    userId: user.id,
    ingestionId,
    parsed: {
      amount: Number(amount.toFixed(2)),
      merchant,
      source,
      source_version: "1.0.0",
      reference,
      category,
      timestamp: parsedDate.toISOString(),
      ingestion_batch_id: `manual-expense:${user.id}:${Date.now()}`,
      ingested_at: new Date().toISOString(),
    },
  });

  if (!persisted.ok) {
    const errorMsg = persisted.reason || "Could not save manual expense. Please retry.";
    redirect(`${returnTo}?error=${toRedirectParam(errorMsg)}`);
  }

  const { error: metadataError } = await supabase
    .from("transactions")
    .update({
      category,
      ai_classification: null,
      ai_reason: null,
      ai_raw_classification: null,
      ai_raw_reason: null,
      ai_user_classification: null,
      ai_user_reason: null,
      ai_review_state: "pending",
      ai_override_at: null,
    })
    .eq("id", persisted.transaction.id)
    .eq("user_id", user.id);

  if (metadataError) {
    const errorMsg = metadataError.message || "Could not save manual expense metadata. Please retry.";
    redirect(`${returnTo}?error=${toRedirectParam(errorMsg)}`);
  }

  const classification = await classifyTransaction({
    merchant,
    amount: Number(amount.toFixed(2)),
    source,
    category,
    reference,
  });

  if (classification.ok) {
    const { error: classificationError } = await supabase
      .from("transactions")
      .update({
        ai_classification: classification.label,
        ai_reason: classification.reason,
        ai_raw_classification: classification.label,
        ai_raw_reason: classification.reason,
        ai_user_classification: null,
        ai_user_reason: null,
        ai_review_state: "pending",
        ai_override_at: null,
      })
      .eq("id", persisted.transaction.id)
      .eq("user_id", user.id);

    if (classificationError) {
      console.error("Classification update error:", classificationError);
    }
  }

  await writeIngestionAuditLog(supabase, {
    ingestion_batch_id: `manual-expense:${ingestionId}`,
    source_type: source,
    source_version: "1.0.0",
    total_rows: 1,
    valid_rows: 1,
    invalid_rows: 0,
    duplicate_rows: persisted.deduplicated ? 1 : 0,
    processing_duration_ms: Date.now() - startedAt,
  }).catch(() => null);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/budgets");

  redirect(`${returnTo}?message=${toRedirectParam("Manual expense saved.")}`);
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

export async function deleteFinancialDocument(formData: FormData) {
  enforceServerSecretPolicy();

  const documentId = String(formData.get("documentId") ?? "").trim();
  const returnTo = parseReturnTo(formData);

  if (!documentId) {
    redirect(`${returnTo}?error=${toRedirectParam("Missing financial document identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("financial_documents")
    .delete()
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}?error=${toRedirectParam("Could not delete the uploaded statement right now.")}`);
  }

  logAuditEvent({
    event: "financial_document_deleted",
    userId: user.id,
    route: returnTo,
    metadata: { documentId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  redirect(`${returnTo}?message=${toRedirectParam("Statement and linked processed data deleted.")}`);
}

export async function retryFinancialDocumentProcessing(formData: FormData) {
  enforceServerSecretPolicy();

  const documentId = String(formData.get("documentId") ?? "").trim();
  const returnTo = parseReturnTo(formData, "/dashboard");

  if (!documentId) {
    redirect(`${returnTo}?error=${toRedirectParam("Missing financial document identifier.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  type FinancialDocumentRow = {
    id: string;
    parse_status: "processing" | "completed" | "failed";
    bank_name: string | null;
    account_holder_name: string | null;
    account_number_masked: string | null;
    currency: string;
  };

  const { data: document, error: documentError } = await supabase
    .from("financial_documents")
    .select("id,parse_status,bank_name,account_holder_name,account_number_masked,currency")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle<FinancialDocumentRow>();

  if (documentError || !document) {
    redirect(`${returnTo}?error=${toRedirectParam("Statement not found or out of scope.")}`);
  }

  if (document.parse_status === "processing") {
    redirect(`${returnTo}?warning=${toRedirectParam("Statement is already processing. Please wait a moment.")}`);
  }

  type StatementRow = {
    posted_at: string;
    description: string;
    amount: number;
    direction: "credit" | "debit";
    balance: number | null;
    reference: string | null;
    category: string | null;
    is_salary: boolean;
    is_emi: boolean;
    transaction_id: string | null;
  };

  const { data: rows, error: rowsError } = await supabase
    .from("financial_document_transactions")
    .select("posted_at,description,amount,direction,balance,reference,category,is_salary,is_emi,transaction_id")
    .eq("document_id", document.id)
    .eq("user_id", user.id)
    .returns<StatementRow[]>();

  if (rowsError || !rows || rows.length === 0) {
    redirect(
      `${returnTo}?error=${toRedirectParam(
        "Retry could not run because no parsed statement rows were found. Please upload the statement again.",
      )}`,
    );
  }

  const parsedRows: ParsedStatementTransaction[] = rows.map((row) => ({
    postedAt: row.posted_at,
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    balance: row.balance,
    reference: row.reference,
    category: row.category,
    isSalary: row.is_salary,
    isEmi: row.is_emi,
  }));

  parsedRows.sort((left, right) => left.postedAt.localeCompare(right.postedAt));

  const statement: ParsedBankStatement = {
    bankName: document.bank_name,
    accountHolderName: document.account_holder_name,
    accountNumberMasked: document.account_number_masked,
    statementPeriodStart: parsedRows[0]?.postedAt ?? null,
    statementPeriodEnd: parsedRows[parsedRows.length - 1]?.postedAt ?? null,
    openingBalance: parsedRows[0]?.balance ?? null,
    closingBalance: parsedRows[parsedRows.length - 1]?.balance ?? null,
    currency: document.currency === "INR" ? "INR" : "INR",
    transactions: parsedRows,
  };

  const analysis = await analyzeBankStatement(statement);

  const importedDebitCount = rows.filter((row) => row.direction === "debit" && row.transaction_id).length;
  const totalCredits = Number(
    rows
      .filter((row) => row.direction === "credit")
      .reduce((sum, row) => sum + Number(row.amount), 0)
      .toFixed(2),
  );
  const totalDebits = Number(
    rows
      .filter((row) => row.direction === "debit")
      .reduce((sum, row) => sum + Number(row.amount), 0)
      .toFixed(2),
  );

  const { error: updateError } = await supabase
    .from("financial_documents")
    .update({
      parse_status: "completed",
      parse_error: null,
      statement_period_start: statement.statementPeriodStart,
      statement_period_end: statement.statementPeriodEnd,
      transaction_count: rows.length,
      imported_debit_count: importedDebitCount,
      total_credits: totalCredits,
      total_debits: totalDebits,
      opening_balance: statement.openingBalance,
      closing_balance: statement.closingBalance,
      extracted_summary: analysis,
      processed_at: new Date().toISOString(),
    })
    .eq("id", document.id)
    .eq("user_id", user.id);

  if (updateError) {
    redirect(`${returnTo}?error=${toRedirectParam("Retry failed while updating statement insights.")}`);
  }

  logAuditEvent({
    event: "financial_document_retry_processed",
    userId: user.id,
    route: returnTo,
    metadata: {
      documentId: document.id,
      rows: rows.length,
      importedDebitCount,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/statements/${document.id}`);
  redirect(`${returnTo}?message=${toRedirectParam("Statement processing retried successfully.")}`);
}
