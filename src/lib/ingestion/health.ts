import { getTelemetry, getDeadLetterRecords, getAlertSeverity } from "@/shared/ingestion/index";
import type { AlertSeverity } from "@/shared/ingestion/index";

export type IngestionAnomalyEntry = {
  level: AlertSeverity;
  event: string;
  threshold: number;
  actual: number;
  timestamp: string;
};

export type IngestionHealthSnapshot = {
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
  anomalies: IngestionAnomalyEntry[];
  sampled_at: string;
};

export function getIngestionHealthSnapshot(): IngestionHealthSnapshot {
  const telemetry = getTelemetry();
  const deadLetterRecords = getDeadLetterRecords();
  const overall_severity = getAlertSeverity();

  const anomalies = (telemetry.alerts as IngestionAnomalyEntry[]).filter(
    (a) => a.level === "warning" || a.level === "critical"
  );

  return {
    pipeline_success_rate: telemetry.pipeline_success_rate,
    duplicate_detection_rate: telemetry.duplicate_detection_rate,
    duplicate_rate: telemetry.duplicate_rate,
    average_import_duration: telemetry.average_import_duration,
    batch_failure_rate: telemetry.batch_failure_rate,
    replay_success_rate: telemetry.replay_success_rate,
    fingerprint_collision_count: telemetry.fingerprint_collision_count,
    dead_letter_count: deadLetterRecords.length,
    high_duplicate_rate: telemetry.high_duplicate_rate,
    high_invalid_rate: telemetry.high_invalid_rate,
    collision_spike: telemetry.collision_spike,
    overall_severity,
    anomalies,
    sampled_at: new Date().toISOString(),
  };
}
