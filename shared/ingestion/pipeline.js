import { normalizeTransaction } from './normalizeTransaction.js';
import { validateTransaction } from './parserValidation.js';
import { transactionFingerprint } from './transactionFingerprint.js';
import {
  recordBatchResult,
  recordDuplicateDetection,
  recordDuplicateScanDuration,
  recordFingerprintCollision,
  recordInvalidTransaction,
  recordNormalizationDuration,
  recordNormalizationResult,
  recordPipelineResult,
  recordReplayResult,
  trackTelemetry,
} from './telemetry.js';

/**
 * Canonical ingestion pipeline entrypoint.
 * Returns deterministic normalized output and a replayable stage snapshot.
 */
export function runIngestionPipeline(rawTransaction, context = {}) {
  const startedAt = Date.now();
  recordBatchResult(true);

  const normalized = normalizeTransaction(rawTransaction, context);
  const fingerprint = transactionFingerprint(normalized);
  normalized.fingerprint = fingerprint;

  try {
    validateTransaction(normalized);
    recordNormalizationResult(true);
    recordPipelineResult(true);
  } catch (error) {
    recordNormalizationResult(false);
    recordPipelineResult(false);
    recordInvalidTransaction();
    recordBatchResult(false);
    trackTelemetry('ingestion.invalid_transaction', {
      source_type: normalized.source_type,
      reason: error instanceof Error ? error.message : 'Validation failed',
    });
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  recordNormalizationDuration(durationMs);
  trackTelemetry('ingestion.normalized', {
    source_type: normalized.source_type,
    ingestion_batch_id: normalized.ingestion_batch_id,
    duration_ms: durationMs,
  });

  return {
    normalized,
    stages: {
      normalized: true,
      validated: true,
      fingerprinted: true,
      duplicate_checked: false,
      categorized: false,
      ai_analyzed: false,
    },
  };
}

/**
 * Replay-capable stage executor. Consumers inject their own duplicate/categorization/AI handlers.
 */
export async function replayIngestionPipeline(normalizedTransaction, handlers = {}) {
  const startedAt = Date.now();
  const result = {
    normalized: normalizedTransaction,
    duplicate: null,
    categorization: null,
    aiAnalysis: null,
  };

  try {
    if (typeof handlers.detectDuplicate === 'function') {
      const duplicateScanStartedAt = Date.now();
      result.duplicate = await handlers.detectDuplicate(normalizedTransaction);
      recordDuplicateScanDuration(Date.now() - duplicateScanStartedAt);
      recordDuplicateDetection(Boolean(result.duplicate));
      if (result.duplicate && result.duplicate.collision === true) {
        recordFingerprintCollision();
      }
    }

    if (typeof handlers.categorize === 'function') {
      result.categorization = await handlers.categorize(normalizedTransaction);
    }

    if (typeof handlers.analyzeWithAI === 'function') {
      result.aiAnalysis = await handlers.analyzeWithAI(normalizedTransaction);
    }

    recordReplayResult(true);
  } catch (error) {
    recordReplayResult(false);
    trackTelemetry('ingestion.replay_failed', {
      source_type: normalizedTransaction.source_type,
      ingestion_batch_id: normalizedTransaction.ingestion_batch_id,
      reason: error instanceof Error ? error.message : 'Replay stage failed',
    });
    throw error;
  }

  trackTelemetry('ingestion.replayed', {
    source_type: normalizedTransaction.source_type,
    ingestion_batch_id: normalizedTransaction.ingestion_batch_id,
    reran_duplicate_detection: Boolean(handlers.detectDuplicate),
    reran_categorization: Boolean(handlers.categorize),
    reran_ai_analysis: Boolean(handlers.analyzeWithAI),
    replay_duration_ms: Date.now() - startedAt,
  });

  return result;
}
