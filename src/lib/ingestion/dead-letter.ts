import type { SupabaseClient } from "@supabase/supabase-js";
import { pushDeadLetterRecord } from "@/shared/ingestion/index";

export type FailedIngestionRecordInput = {
  ingestion_batch_id: string;
  source_type: string;
  source_version?: string;
  reason: string;
  retryable: boolean;
  route: string;
  user_id?: string | null;
  payload: Record<string, unknown>;
};

export async function writeFailedIngestionRecord(
  supabase: SupabaseClient,
  input: FailedIngestionRecordInput,
): Promise<void> {
  const now = new Date().toISOString();

  pushDeadLetterRecord({
    ingestion_batch_id: input.ingestion_batch_id,
    source_type: input.source_type,
    source_version: input.source_version ?? "1.0.0",
    reason: input.reason,
    row: input.payload,
    recorded_at: now,
  });

  await supabase.from("failed_ingestion_records").insert({
    user_id: input.user_id ?? null,
    ingestion_batch_id: input.ingestion_batch_id,
    source_type: input.source_type,
    source_version: input.source_version ?? "1.0.0",
    reason: input.reason,
    retryable: input.retryable,
    route: input.route,
    payload: input.payload,
    recorded_at: now,
  });
}
