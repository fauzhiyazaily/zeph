import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestionHealthSnapshot } from "@/lib/ingestion/health";
import { validateSLOs } from "@/lib/ingestion/slo";

export type GovernanceSnapshotInput = IngestionHealthSnapshot;

export type GovernanceSnapshotResult = {
  id: string;
  snapshot_at: string;
  governance_pass: boolean;
};

/**
 * Persist the current ingestion health snapshot to governance_snapshot_logs.
 *
 * Call this from post-batch hooks, scheduled jobs, or CI deployment gates
 * to build a continuous record of governance compliance over time.
 *
 * @param supabase  Authenticated Supabase client (service-role for writes)
 * @param snapshot  Health snapshot from getIngestionHealthSnapshot()
 * @param userId    Optional ID of the user or job triggering the snapshot
 */
export async function writeGovernanceSnapshot(
  supabase: SupabaseClient,
  snapshot: GovernanceSnapshotInput,
  userId?: string
): Promise<GovernanceSnapshotResult> {
  const sloResult = validateSLOs(snapshot);

  const row = {
    pipeline_success_rate: snapshot.pipeline_success_rate,
    replay_success_rate: snapshot.replay_success_rate,
    fingerprint_collision_count: snapshot.fingerprint_collision_count,
    dead_letter_count: snapshot.dead_letter_count,
    duplicate_detection_rate: snapshot.duplicate_detection_rate,
    batch_failure_rate: snapshot.batch_failure_rate,
    high_duplicate_rate: snapshot.high_duplicate_rate,
    high_invalid_rate: snapshot.high_invalid_rate,
    collision_spike: snapshot.collision_spike,
    overall_severity: snapshot.overall_severity,
    anomaly_count: snapshot.anomalies.length,
    governance_pass: sloResult.passing && snapshot.overall_severity !== "critical",
    slo_violations: sloResult.violations,
    ...(userId ? { recorded_by: userId } : {}),
  };

  const { data, error } = await supabase
    .from("governance_snapshot_logs")
    .insert(row)
    .select("id, snapshot_at, governance_pass")
    .single();

  if (error) {
    throw new Error(`Failed to write governance snapshot: ${error.message}`);
  }

  return data as GovernanceSnapshotResult;
}
