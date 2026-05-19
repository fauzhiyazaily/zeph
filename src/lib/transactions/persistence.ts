import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngestionPipeline } from "@/shared/ingestion/index";

export type PersistableParsedTransaction = {
  amount: number;
  merchant: string;
  source: string;
  source_version?: string;
  reference: string | null;
  timestamp: string;
  category?: string | null;
  financial_document_id?: string | null;
  ingestion_batch_id?: string;
  ingested_at?: string;
  fingerprint?: string;
};

type PersistInput = {
  userId: string;
  ingestionId: string;
  parsed: PersistableParsedTransaction;
};

type PersistedTransaction = {
  id: string;
  userId: string;
  ingestionId: string;
  ingestionBatchId: string;
  fingerprint: string;
  amount: number;
  merchant: string;
  source: string;
  reference: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistResult =
  | { ok: true; transaction: PersistedTransaction; deduplicated: boolean }
  | { ok: false; reason: string; code: string; retryable: boolean };

type TransactionRow = {
  id: string;
  user_id: string;
  ingestion_id: string;
  amount: number;
  merchant: string;
  source: string;
  reference: string | null;
  date: string;
  created_at: string;
  updated_at: string;
};

const RETRYABLE_DB_CODES = new Set(["40001", "53300", "57014", "57P01"]);

function toPersistedTransaction(row: TransactionRow): PersistedTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    ingestionId: row.ingestion_id,
    ingestionBatchId: "",
    fingerprint: "",
    amount: row.amount,
    merchant: row.merchant,
    source: row.source,
    reference: row.reference,
    timestamp: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateParsedTransaction(parsed: PersistableParsedTransaction): PersistResult | null {
  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      reason: "Amount must be a positive number.",
      retryable: false,
    };
  }

  if (!parsed.merchant || parsed.merchant.trim().length < 2 || parsed.merchant.length > 120) {
    return {
      ok: false,
      code: "INVALID_MERCHANT",
      reason: "Merchant must be 2-120 characters.",
      retryable: false,
    };
  }

  const ts = new Date(parsed.timestamp);
  if (Number.isNaN(ts.getTime())) {
    return {
      ok: false,
      code: "INVALID_TIMESTAMP",
      reason: "Timestamp is invalid.",
      retryable: false,
    };
  }

  return null;
}

export async function persistTransaction(
  supabase: SupabaseClient,
  input: PersistInput,
): Promise<PersistResult> {
  const canonical = runIngestionPipeline(
    {
      merchant: input.parsed.merchant,
      amount: input.parsed.amount,
      date: input.parsed.timestamp,
      reference: input.parsed.reference,
      ingestion_batch_id: input.parsed.ingestion_batch_id,
      ingested_at: input.parsed.ingested_at,
    },
    {
      source_type: input.parsed.source,
      source_version: input.parsed.source_version ?? "1.0.0",
      ingestion_batch_id: input.parsed.ingestion_batch_id,
      ingested_at: input.parsed.ingested_at,
    },
  );

  const canonicalParsed: PersistableParsedTransaction = {
    amount: canonical.normalized.amount,
    merchant: canonical.normalized.merchant,
    source: canonical.normalized.source_type,
    source_version: canonical.normalized.source_version,
    reference: canonical.normalized.reference,
    timestamp: input.parsed.timestamp,
    ingestion_batch_id: canonical.normalized.ingestion_batch_id,
    ingested_at: canonical.normalized.ingested_at,
    fingerprint: canonical.normalized.fingerprint,
  };

  const validationError = validateParsedTransaction(canonicalParsed);
  if (validationError) {
    return validationError;
  }

  const nowIso = new Date().toISOString();
  const rowToSave = {
    user_id: input.userId,
    ingestion_id: input.ingestionId,
    ingestion_batch_id: canonicalParsed.ingestion_batch_id,
    ingestion_fingerprint: canonicalParsed.fingerprint,
    amount: canonicalParsed.amount,
    merchant: canonicalParsed.merchant.trim(),
    source: canonicalParsed.source,
    reference: canonicalParsed.reference,
    category: input.parsed.category ?? null,
    date: canonicalParsed.timestamp,
    created_at: nowIso,
    updated_at: nowIso,
    ...(input.parsed.financial_document_id != null
      ? { financial_document_id: input.parsed.financial_document_id }
      : {}),
  };

  const { data, error } = await supabase
    .from("transactions")
    .insert(rowToSave)
    .select("id,user_id,ingestion_id,amount,merchant,source,reference,date,created_at,updated_at")
    .single<TransactionRow>();

  if (error) {
    const code = error.code ?? "DB_WRITE_FAILED";

    if (code === "23505") {
      const { data: existingRow, error: existingError } = await supabase
        .from("transactions")
        .select("id,user_id,ingestion_id,amount,merchant,source,reference,date,created_at,updated_at")
        .eq("user_id", input.userId)
        .eq("ingestion_id", input.ingestionId)
        .maybeSingle<TransactionRow>();

      if (!existingError && existingRow) {
        return {
          ok: true,
          transaction: {
            ...toPersistedTransaction(existingRow),
            ingestionBatchId: canonicalParsed.ingestion_batch_id ?? "",
            fingerprint: canonicalParsed.fingerprint ?? "",
          },
          deduplicated: true,
        };
      }
    }

    return {
      ok: false,
      code,
      reason: error.message,
      retryable: RETRYABLE_DB_CODES.has(code),
    };
  }

  if (!data) {
    return {
      ok: false,
      code: "DB_EMPTY_RESPONSE",
      reason: "Database write returned no row.",
      retryable: true,
    };
  }

  return {
    ok: true,
    transaction: {
      ...toPersistedTransaction(data),
      ingestionBatchId: canonicalParsed.ingestion_batch_id ?? "",
      fingerprint: canonicalParsed.fingerprint ?? "",
    },
    deduplicated: false,
  };
}
