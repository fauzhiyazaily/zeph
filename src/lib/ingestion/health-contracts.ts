import type { AlertSeverity } from "@/shared/ingestion/index";

/**
 * Wire-format contract for GET /api/ingestion/health responses.
 *
 * Used by frontend health widgets and operational dashboards.
 * Keep in sync with IngestionHealthSnapshot from @/lib/ingestion/health.
 */
export type IngestionHealthAPIResponse = {
  pipeline_success_rate: number;
  duplicate_detection_rate: number;
  duplicate_rate: number;
  average_import_duration: number;
  batch_failure_rate: number;
  replay_success_rate: number;
  fingerprint_collision_count: number;
  dead_letter_count: number;
  high_duplicate_rate: boolean;
  high_invalid_rate: boolean;
  collision_spike: boolean;
  overall_severity: AlertSeverity;
  anomalies: IngestionAnomalyAPIEntry[];
  sampled_at: string;
};

export type IngestionAnomalyAPIEntry = {
  level: AlertSeverity;
  event: string;
  threshold: number;
  actual: number;
  timestamp: string;
};

/** True if the health snapshot carries any CRITICAL-level anomaly. */
export function hasIngestionCritical(snapshot: IngestionHealthAPIResponse): boolean {
  return snapshot.overall_severity === "critical";
}

/** Subset of anomalies at or above the given severity level. */
export function filterAnomaliesBySeverity(
  snapshot: IngestionHealthAPIResponse,
  minSeverity: AlertSeverity
): IngestionAnomalyAPIEntry[] {
  const order: AlertSeverity[] = ["info", "warning", "critical"];
  const minIndex = order.indexOf(minSeverity);
  return snapshot.anomalies.filter((a) => order.indexOf(a.level) >= minIndex);
}
