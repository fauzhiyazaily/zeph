import type { IngestionHealthSnapshot } from "@/lib/ingestion/health";

/**
 * Service-Level Objectives for the ingestion governance platform.
 *
 * These constants define the minimum acceptable quality thresholds for
 * production financial ingestion. Violations should trigger alerts or
 * block deployment via the governance CI gate.
 *
 * All rate values are expressed as fractions (0.0 – 1.0).
 */
export const INGESTION_SLOS = {
  /** Minimum fraction of pipeline runs that must succeed. */
  min_pipeline_success_rate: 0.99,

  /** Maximum fraction of replay runs that are allowed to fail. */
  max_replay_failure_rate: 0.05,

  /** Maximum fingerprint collision count before deployment is blocked. */
  max_fingerprint_collision_count: 10,

  /** Maximum dead-letter queue depth before deployment is blocked. */
  max_dead_letter_count: 50,

  /** Maximum fraction of import batches that are allowed to fail. */
  max_batch_failure_rate: 0.01,

  /** Maximum duplicate detection rate (sanity ceiling — not a quality goal). */
  max_duplicate_detection_rate: 0.5,
} as const;

export type SLOViolation = {
  slo: keyof typeof INGESTION_SLOS;
  threshold: number;
  actual: number;
  message: string;
};

export type SLOValidationResult = {
  passing: boolean;
  violations: SLOViolation[];
  checked_at: string;
};

/**
 * Validate a health snapshot against defined SLOs.
 *
 * Returns a detailed result listing every violated SLO.
 * `passing` is false if any violation exists.
 */
export function validateSLOs(snapshot: IngestionHealthSnapshot): SLOValidationResult {
  const violations: SLOViolation[] = [];
  const s = INGESTION_SLOS;

  if (snapshot.pipeline_success_rate < s.min_pipeline_success_rate) {
    violations.push({
      slo: "min_pipeline_success_rate",
      threshold: s.min_pipeline_success_rate,
      actual: snapshot.pipeline_success_rate,
      message: `Pipeline success rate ${(snapshot.pipeline_success_rate * 100).toFixed(1)}% is below minimum ${(s.min_pipeline_success_rate * 100).toFixed(1)}%`,
    });
  }

  const replay_failure_rate = snapshot.replay_success_rate < 1
    ? 1 - snapshot.replay_success_rate
    : 0;
  if (replay_failure_rate > s.max_replay_failure_rate) {
    violations.push({
      slo: "max_replay_failure_rate",
      threshold: s.max_replay_failure_rate,
      actual: replay_failure_rate,
      message: `Replay failure rate ${(replay_failure_rate * 100).toFixed(1)}% exceeds maximum ${(s.max_replay_failure_rate * 100).toFixed(1)}%`,
    });
  }

  if (snapshot.fingerprint_collision_count > s.max_fingerprint_collision_count) {
    violations.push({
      slo: "max_fingerprint_collision_count",
      threshold: s.max_fingerprint_collision_count,
      actual: snapshot.fingerprint_collision_count,
      message: `Fingerprint collision count ${snapshot.fingerprint_collision_count} exceeds maximum ${s.max_fingerprint_collision_count}`,
    });
  }

  if (snapshot.dead_letter_count > s.max_dead_letter_count) {
    violations.push({
      slo: "max_dead_letter_count",
      threshold: s.max_dead_letter_count,
      actual: snapshot.dead_letter_count,
      message: `Dead-letter queue depth ${snapshot.dead_letter_count} exceeds maximum ${s.max_dead_letter_count}`,
    });
  }

  if (snapshot.batch_failure_rate > s.max_batch_failure_rate) {
    violations.push({
      slo: "max_batch_failure_rate",
      threshold: s.max_batch_failure_rate,
      actual: snapshot.batch_failure_rate,
      message: `Batch failure rate ${(snapshot.batch_failure_rate * 100).toFixed(1)}% exceeds maximum ${(s.max_batch_failure_rate * 100).toFixed(1)}%`,
    });
  }

  return {
    passing: violations.length === 0,
    violations,
    checked_at: new Date().toISOString(),
  };
}
