import * as sharedModule from "@shared/ingestion";

export type AlertSeverity = 'info' | 'warning' | 'critical';

type CanonicalSourceType = string;

export type CanonicalNormalizedTransaction = {
  merchant: string;
  amount: number;
  date: string;
  reference: string | null;
  fingerprint: string;
  ingestion_schema_version: string;
  ingestion_pipeline_version: string;
  source_type: CanonicalSourceType;
  source_version: string;
  ingestion_batch_id: string;
  ingested_at: string;
  normalized_at: string;
} & Record<string, unknown>;

export type CanonicalPipelineResult = {
  normalized: CanonicalNormalizedTransaction;
  stages: {
    normalized: boolean;
    validated: boolean;
    fingerprinted: boolean;
    duplicate_checked: boolean;
    categorized: boolean;
    ai_analyzed: boolean;
  };
};

export type ReplayHandlers = {
  detectDuplicate?: (normalizedTransaction: CanonicalNormalizedTransaction) => Promise<unknown> | unknown;
  categorize?: (normalizedTransaction: CanonicalNormalizedTransaction) => Promise<unknown> | unknown;
  analyzeWithAI?: (normalizedTransaction: CanonicalNormalizedTransaction) => Promise<unknown> | unknown;
};

export type ReplayResult = {
  normalized: CanonicalNormalizedTransaction;
  duplicate: unknown;
  categorization: unknown;
  aiAnalysis: unknown;
};

export type IngestionTelemetrySnapshot = {
  normalization_success_rate: number;
  duplicate_detection_rate: number;
  duplicate_rate: number;
  average_import_duration: number;
  average_normalization_duration: number;
  average_duplicate_scan_duration: number;
  invalid_transaction_rate: number;
  pipeline_success_rate: number;
  replay_success_rate: number;
  replay_failure_rate: number;
  batch_failure_rate: number;
  fingerprint_collision_count: number;
  high_duplicate_rate: boolean;
  high_invalid_rate: boolean;
  collision_spike: boolean;
  has_critical_alerts: boolean;
  critical_alert_count: number;
  warning_alert_count: number;
  alerts: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

export type DeadLetterRecord = {
  ingestion_batch_id: string;
  source_type: string;
  source_version?: string;
  reason: string;
  row: Record<string, unknown>;
  recorded_at?: string;
  queued_at?: string;
  retry_count?: number;
  last_retried_at?: string | null;
};

export type ReconciliationInput = {
  ingestion_batch_id?: string | null;
  total_rows?: number;
  imported_rows?: number;
  duplicate_skips?: number;
  failed_rows?: number;
  replay_differences?: number;
  audit_log?: {
    valid_rows?: number;
    invalid_rows?: number;
    duplicate_rows?: number;
  };
};

export type ReconciliationResult = {
  ingestion_batch_id: string | null;
  total_rows: number;
  imported_rows: number;
  duplicate_skips: number;
  failed_rows: number;
  replay_differences: number;
  processed_rows: number;
  unmatched_rows: number;
  audit_log_consistency: {
    audit_valid_rows: number;
    audit_invalid_rows: number;
    audit_duplicate_rows: number;
    audit_consistent: boolean;
  };
  reconciled_at: string;
};

const shared = sharedModule as unknown as {
  ALERT_SEVERITY: Readonly<{ INFO: 'info'; WARNING: 'warning'; CRITICAL: 'critical' }>;
  INGESTION_SCHEMA_VERSION: string;
  INGESTION_PIPELINE_VERSION: string;
  HIGH_DUPLICATE_RATE_THRESHOLD: number;
  HIGH_INVALID_RATE_THRESHOLD: number;
  COLLISION_SPIKE_THRESHOLD: number;
  HIGH_REPLAY_FAILURE_RATE_THRESHOLD: number;
  FINGERPRINT_COLLISION_ALERT_THRESHOLD: number;
  normalizeTransaction: (transaction: Record<string, unknown>, options?: Record<string, unknown>) => CanonicalNormalizedTransaction;
  createIngestionBatchId: (sourceType?: string) => string;
  validateTransaction: (transaction: CanonicalNormalizedTransaction) => void;
  transactionFingerprint: (transaction: Record<string, unknown>) => string;
  hasFingerprintCollision: (existingFingerprintMap: Map<string, string>, fingerprint: string, transactionId: string) => boolean;
  runIngestionPipeline: (rawTransaction: Record<string, unknown>, context?: Record<string, unknown>) => CanonicalPipelineResult;
  replayIngestionPipeline: (normalizedTransaction: CanonicalNormalizedTransaction, handlers?: ReplayHandlers) => Promise<ReplayResult>;
  trackTelemetry: (event: string, metadata?: Record<string, unknown>) => void;
  getAlertSeverity: () => AlertSeverity;
  getTelemetry: () => IngestionTelemetrySnapshot;
  incrementTelemetry: (metric: string) => void;
  recordBatchResult: (success: boolean) => void;
  recordDuplicateDetection: (isDuplicate: boolean) => void;
  recordDuplicateScanDuration: (durationMs: number) => void;
  recordFingerprintCollision: () => void;
  recordImportDuration: (durationMs: number) => void;
  recordInvalidTransaction: () => void;
  recordNormalizationDuration: (durationMs: number) => void;
  recordNormalizationResult: (success: boolean) => void;
  recordPipelineResult: (success: boolean) => void;
  recordReplayResult: (success: boolean) => void;
  resetTelemetry: () => void;
  reconcileIngestionBatch: (batch?: ReconciliationInput) => ReconciliationResult;
  getDeadLetterRecords: () => DeadLetterRecord[];
  pushDeadLetterRecord: (record: DeadLetterRecord) => void;
  retryDeadLetterRecord: (ingestionBatchId: string, rowIndex?: number) => DeadLetterRecord | null;
  removeDeadLetterRecord: (ingestionBatchId: string, rowIndex?: number) => boolean;
  resetDeadLetterRecords: () => void;
};

export const ALERT_SEVERITY = shared.ALERT_SEVERITY;
export const INGESTION_SCHEMA_VERSION = shared.INGESTION_SCHEMA_VERSION;
export const INGESTION_PIPELINE_VERSION = shared.INGESTION_PIPELINE_VERSION;
export const HIGH_DUPLICATE_RATE_THRESHOLD = shared.HIGH_DUPLICATE_RATE_THRESHOLD;
export const HIGH_INVALID_RATE_THRESHOLD = shared.HIGH_INVALID_RATE_THRESHOLD;
export const COLLISION_SPIKE_THRESHOLD = shared.COLLISION_SPIKE_THRESHOLD;
export const HIGH_REPLAY_FAILURE_RATE_THRESHOLD = shared.HIGH_REPLAY_FAILURE_RATE_THRESHOLD;
export const FINGERPRINT_COLLISION_ALERT_THRESHOLD = shared.FINGERPRINT_COLLISION_ALERT_THRESHOLD;

export const normalizeTransaction = shared.normalizeTransaction;
export const createIngestionBatchId = shared.createIngestionBatchId;
export const validateTransaction = shared.validateTransaction;
export const transactionFingerprint = shared.transactionFingerprint;
export const hasFingerprintCollision = shared.hasFingerprintCollision;

export const runIngestionPipeline = shared.runIngestionPipeline;
export const replayIngestionPipeline = shared.replayIngestionPipeline;

export const trackTelemetry = shared.trackTelemetry;
export const getTelemetry = shared.getTelemetry;
export const incrementTelemetry = shared.incrementTelemetry;
export const recordBatchResult = shared.recordBatchResult;
export const recordDuplicateDetection = shared.recordDuplicateDetection;
export const recordDuplicateScanDuration = shared.recordDuplicateScanDuration;
export const recordFingerprintCollision = shared.recordFingerprintCollision;
export const recordImportDuration = shared.recordImportDuration;
export const recordInvalidTransaction = shared.recordInvalidTransaction;
export const recordNormalizationDuration = shared.recordNormalizationDuration;
export const recordNormalizationResult = shared.recordNormalizationResult;
export const recordPipelineResult = shared.recordPipelineResult;
export const recordReplayResult = shared.recordReplayResult;
export const getAlertSeverity = shared.getAlertSeverity;
export const resetTelemetry = shared.resetTelemetry;

export const reconcileIngestionBatch = shared.reconcileIngestionBatch;
export const getDeadLetterRecords = shared.getDeadLetterRecords;
export const pushDeadLetterRecord = shared.pushDeadLetterRecord;
export const retryDeadLetterRecord = shared.retryDeadLetterRecord;
export const removeDeadLetterRecord = shared.removeDeadLetterRecord;
export const resetDeadLetterRecords = shared.resetDeadLetterRecords;
