// Telemetry hooks for ingestion layer.
// Metrics are kept in-memory and represent process-local operational state.

/** @typedef {'info' | 'warning' | 'critical'} AlertSeverity */
export const ALERT_SEVERITY = /** @type {const} */ ({ INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' });

export const FINGERPRINT_COLLISION_ALERT_THRESHOLD = 10;
export const HIGH_DUPLICATE_RATE_THRESHOLD = 0.25;
export const HIGH_INVALID_RATE_THRESHOLD = 0.1;
export const COLLISION_SPIKE_THRESHOLD = 5;
export const HIGH_REPLAY_FAILURE_RATE_THRESHOLD = 0.1;

const telemetry = {
  normalizationAttempts: 0,
  normalizationSuccesses: 0,
  normalizationDurationTotalMs: 0,
  normalizationDurationSamples: 0,
  duplicateChecks: 0,
  duplicateHits: 0,
  duplicateScanDurationTotalMs: 0,
  duplicateScanDurationSamples: 0,
  importDurationTotalMs: 0,
  importDurationSamples: 0,
  invalidTransactions: 0,
  fingerprintCollisionCount: 0,
  pipelineRuns: 0,
  pipelineSuccesses: 0,
  replayRuns: 0,
  replaySuccesses: 0,
  batchRuns: 0,
  batchFailures: 0,
  events: [],
  alerts: [],
  anomalyFlags: {
    high_duplicate_rate: false,
    high_invalid_rate: false,
    collision_spike: false,
    high_replay_failure_rate: false,
  },
};

function computeSnapshot() {
  const normalization_success_rate =
    telemetry.normalizationAttempts === 0
      ? 0
      : telemetry.normalizationSuccesses / telemetry.normalizationAttempts;

  const duplicate_detection_rate =
    telemetry.duplicateChecks === 0 ? 0 : telemetry.duplicateHits / telemetry.duplicateChecks;

  const average_import_duration =
    telemetry.importDurationSamples === 0
      ? 0
      : telemetry.importDurationTotalMs / telemetry.importDurationSamples;

  const average_normalization_duration =
    telemetry.normalizationDurationSamples === 0
      ? 0
      : telemetry.normalizationDurationTotalMs / telemetry.normalizationDurationSamples;

  const average_duplicate_scan_duration =
    telemetry.duplicateScanDurationSamples === 0
      ? 0
      : telemetry.duplicateScanDurationTotalMs / telemetry.duplicateScanDurationSamples;

  const invalid_transaction_rate =
    telemetry.normalizationAttempts === 0 ? 0 : telemetry.invalidTransactions / telemetry.normalizationAttempts;

  const pipeline_success_rate = telemetry.pipelineRuns === 0 ? 0 : telemetry.pipelineSuccesses / telemetry.pipelineRuns;

  const replay_success_rate = telemetry.replayRuns === 0 ? 0 : telemetry.replaySuccesses / telemetry.replayRuns;

  const replay_failure_rate = telemetry.replayRuns === 0 ? 0 : (telemetry.replayRuns - telemetry.replaySuccesses) / telemetry.replayRuns;

  const batch_failure_rate = telemetry.batchRuns === 0 ? 0 : telemetry.batchFailures / telemetry.batchRuns;

  return {
    normalization_success_rate,
    duplicate_detection_rate,
    duplicate_rate: duplicate_detection_rate,
    average_import_duration,
    average_normalization_duration,
    average_duplicate_scan_duration,
    invalid_transaction_rate,
    pipeline_success_rate,
    replay_success_rate,
    replay_failure_rate,
    batch_failure_rate,
    fingerprint_collision_count: telemetry.fingerprintCollisionCount,
  };
}

/**
 * @param {string} key
 * @param {string} event
 * @param {Object} details
 * @param {AlertSeverity} [severity='warning']
 */
function emitAnomalyAlert(key, event, details, severity = ALERT_SEVERITY.WARNING) {
  if (telemetry.anomalyFlags[key]) {
    return;
  }

  telemetry.anomalyFlags[key] = true;
  const alert = {
    level: severity,
    event,
    ...details,
    timestamp: new Date().toISOString(),
  };
  telemetry.alerts.push(alert);
  trackTelemetry(event, { ...details, level: severity });
}

function evaluateAnomalies() {
  const snapshot = computeSnapshot();

  if (snapshot.duplicate_detection_rate >= HIGH_DUPLICATE_RATE_THRESHOLD) {
    emitAnomalyAlert('high_duplicate_rate', 'ingestion.high_duplicate_rate', {
      threshold: HIGH_DUPLICATE_RATE_THRESHOLD,
      actual: snapshot.duplicate_detection_rate,
    }, ALERT_SEVERITY.WARNING);
  } else {
    telemetry.anomalyFlags.high_duplicate_rate = false;
  }

  if (snapshot.invalid_transaction_rate >= HIGH_INVALID_RATE_THRESHOLD) {
    emitAnomalyAlert('high_invalid_rate', 'ingestion.high_invalid_rate', {
      threshold: HIGH_INVALID_RATE_THRESHOLD,
      actual: snapshot.invalid_transaction_rate,
    }, ALERT_SEVERITY.WARNING);
  } else {
    telemetry.anomalyFlags.high_invalid_rate = false;
  }

  if (snapshot.fingerprint_collision_count >= COLLISION_SPIKE_THRESHOLD) {
    emitAnomalyAlert('collision_spike', 'ingestion.collision_spike', {
      threshold: COLLISION_SPIKE_THRESHOLD,
      actual: snapshot.fingerprint_collision_count,
    }, ALERT_SEVERITY.CRITICAL);
  } else {
    telemetry.anomalyFlags.collision_spike = false;
  }

  if (snapshot.replay_failure_rate >= HIGH_REPLAY_FAILURE_RATE_THRESHOLD) {
    emitAnomalyAlert('high_replay_failure_rate', 'ingestion.replay_failure_rate', {
      threshold: HIGH_REPLAY_FAILURE_RATE_THRESHOLD,
      actual: snapshot.replay_failure_rate,
    }, ALERT_SEVERITY.CRITICAL);
  } else {
    telemetry.anomalyFlags.high_replay_failure_rate = false;
  }
}

export function trackTelemetry(event, metadata = {}) {
  telemetry.events.push({
    event,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

export function recordNormalizationResult(success) {
  telemetry.normalizationAttempts += 1;
  if (success) {
    telemetry.normalizationSuccesses += 1;
  }
  evaluateAnomalies();
}

export function recordNormalizationDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  telemetry.normalizationDurationTotalMs += durationMs;
  telemetry.normalizationDurationSamples += 1;
}

export function recordDuplicateDetection(isDuplicate) {
  telemetry.duplicateChecks += 1;
  if (isDuplicate) {
    telemetry.duplicateHits += 1;
  }
  evaluateAnomalies();
}

export function recordDuplicateScanDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  telemetry.duplicateScanDurationTotalMs += durationMs;
  telemetry.duplicateScanDurationSamples += 1;
}

export function recordImportDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  telemetry.importDurationTotalMs += durationMs;
  telemetry.importDurationSamples += 1;
}

export function recordInvalidTransaction() {
  telemetry.invalidTransactions += 1;
  evaluateAnomalies();
}

export function recordFingerprintCollision() {
  telemetry.fingerprintCollisionCount += 1;

  evaluateAnomalies();

  if (telemetry.fingerprintCollisionCount >= FINGERPRINT_COLLISION_ALERT_THRESHOLD) {
    const alert = {
      level: ALERT_SEVERITY.CRITICAL,
      event: 'ingestion.fingerprint_collision_threshold_exceeded',
      threshold: FINGERPRINT_COLLISION_ALERT_THRESHOLD,
      actual: telemetry.fingerprintCollisionCount,
      timestamp: new Date().toISOString(),
    };
    telemetry.alerts.push(alert);
    trackTelemetry(alert.event, {
      threshold: alert.threshold,
      actual: alert.actual,
      level: ALERT_SEVERITY.CRITICAL,
    });
  }
}

export function recordPipelineResult(success) {
  telemetry.pipelineRuns += 1;
  if (success) {
    telemetry.pipelineSuccesses += 1;
  }
}

export function recordReplayResult(success) {
  telemetry.replayRuns += 1;
  if (success) {
    telemetry.replaySuccesses += 1;
  }
  evaluateAnomalies();
}

export function recordBatchResult(success) {
  telemetry.batchRuns += 1;
  if (!success) {
    telemetry.batchFailures += 1;
  }
}

/**
 * Backward compatibility helper for existing metric increment usage.
 * @param {string} metric - Legacy metric name.
 */
export function incrementTelemetry(metric) {
  switch (metric) {
    case 'normalizationFailures':
      telemetry.normalizationAttempts += 1;
      break;
    case 'duplicateGroupsDetected':
      telemetry.duplicateChecks += 1;
      telemetry.duplicateHits += 1;
      break;
    case 'invalidTransactionCount':
      telemetry.invalidTransactions += 1;
      break;
    case 'fingerprintCollisions':
      telemetry.fingerprintCollisionCount += 1;
      break;
    default:
      break;
  }
}

/**
 * Get derived operational metrics and captured events.
 * @returns {Object}
 */
export function getTelemetry() {
  evaluateAnomalies();
  const snapshot = computeSnapshot();

  const critical_alerts = telemetry.alerts.filter((a) => a.level === ALERT_SEVERITY.CRITICAL);
  const warning_alerts = telemetry.alerts.filter((a) => a.level === ALERT_SEVERITY.WARNING);

  return {
    ...snapshot,
    high_duplicate_rate: snapshot.duplicate_detection_rate >= HIGH_DUPLICATE_RATE_THRESHOLD,
    high_invalid_rate: snapshot.invalid_transaction_rate >= HIGH_INVALID_RATE_THRESHOLD,
    collision_spike: snapshot.fingerprint_collision_count >= COLLISION_SPIKE_THRESHOLD,
    has_critical_alerts: critical_alerts.length > 0,
    critical_alert_count: critical_alerts.length,
    warning_alert_count: warning_alerts.length,
    alerts: [...telemetry.alerts],
    events: [...telemetry.events],
  };
}

export function getAlertSeverity() {
  evaluateAnomalies();
  const hasCritical = telemetry.alerts.some((a) => a.level === ALERT_SEVERITY.CRITICAL);
  const hasWarning = telemetry.alerts.some((a) => a.level === ALERT_SEVERITY.WARNING);

  if (hasCritical) {
    return ALERT_SEVERITY.CRITICAL;
  }

  if (hasWarning) {
    return ALERT_SEVERITY.WARNING;
  }

  return ALERT_SEVERITY.INFO;
}

/**
 * Reset telemetry counters.
 */
export function resetTelemetry() {
  telemetry.normalizationAttempts = 0;
  telemetry.normalizationSuccesses = 0;
  telemetry.normalizationDurationTotalMs = 0;
  telemetry.normalizationDurationSamples = 0;
  telemetry.duplicateChecks = 0;
  telemetry.duplicateHits = 0;
  telemetry.duplicateScanDurationTotalMs = 0;
  telemetry.duplicateScanDurationSamples = 0;
  telemetry.importDurationTotalMs = 0;
  telemetry.importDurationSamples = 0;
  telemetry.invalidTransactions = 0;
  telemetry.fingerprintCollisionCount = 0;
  telemetry.pipelineRuns = 0;
  telemetry.pipelineSuccesses = 0;
  telemetry.replayRuns = 0;
  telemetry.replaySuccesses = 0;
  telemetry.batchRuns = 0;
  telemetry.batchFailures = 0;
  telemetry.events = [];
  telemetry.alerts = [];
  telemetry.anomalyFlags.high_duplicate_rate = false;
  telemetry.anomalyFlags.high_invalid_rate = false;
  telemetry.anomalyFlags.collision_spike = false;
  telemetry.anomalyFlags.high_replay_failure_rate = false;
}