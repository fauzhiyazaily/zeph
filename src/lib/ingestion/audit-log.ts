import type { SupabaseClient } from "@supabase/supabase-js";
import { INGESTION_PIPELINE_VERSION } from "@/shared/ingestion/index";

export type IngestionAuditLogInput = {
  ingestion_batch_id: string;
  source_type: string;
  source_version?: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  processing_duration_ms: number;
  pipeline_version?: string;
  replayed_at?: string | null;
  replay_source_batch_id?: string | null;
  replay_pipeline_version?: string | null;
  linked_transaction_id?: string | null;
};

export async function writeIngestionAuditLog(
  supabase: SupabaseClient,
  input: IngestionAuditLogInput,
): Promise<void> {
  await supabase.from("ingestion_audit_logs").insert({
    ingestion_batch_id: input.ingestion_batch_id,
    source_type: input.source_type,
    source_version: input.source_version ?? "1.0.0",
    pipeline_version: input.pipeline_version ?? INGESTION_PIPELINE_VERSION,
    total_rows: input.total_rows,
    valid_rows: input.valid_rows,
    invalid_rows: input.invalid_rows,
    duplicate_rows: input.duplicate_rows,
    processing_duration_ms: Math.max(0, Math.round(input.processing_duration_ms)),
    replayed_at: input.replayed_at ?? null,
    replay_source_batch_id: input.replay_source_batch_id ?? null,
    replay_pipeline_version: input.replay_pipeline_version ?? null,
    linked_transaction_id: input.linked_transaction_id ?? null,
  });
}
