export function reconcileIngestionBatch(batch = {}) {
  const imported_rows = Math.max(0, Number(batch.imported_rows ?? 0));
  const duplicate_skips = Math.max(0, Number(batch.duplicate_skips ?? 0));
  const failed_rows = Math.max(0, Number(batch.failed_rows ?? 0));
  const replay_differences = Math.max(0, Number(batch.replay_differences ?? 0));
  const total_rows = Math.max(0, Number(batch.total_rows ?? imported_rows + duplicate_skips + failed_rows));
  const processed_rows = imported_rows + duplicate_skips + failed_rows;
  const unmatched_rows = Math.max(0, total_rows - processed_rows);

  const auditLog = batch.audit_log ?? {};
  const audit_valid_rows = Math.max(0, Number(auditLog.valid_rows ?? imported_rows));
  const audit_invalid_rows = Math.max(0, Number(auditLog.invalid_rows ?? failed_rows));
  const audit_duplicate_rows = Math.max(0, Number(auditLog.duplicate_rows ?? duplicate_skips));

  const audit_consistent =
    audit_valid_rows === imported_rows &&
    audit_invalid_rows === failed_rows &&
    audit_duplicate_rows === duplicate_skips;

  return {
    ingestion_batch_id: batch.ingestion_batch_id ?? null,
    total_rows,
    imported_rows,
    duplicate_skips,
    failed_rows,
    replay_differences,
    processed_rows,
    unmatched_rows,
    audit_log_consistency: {
      audit_valid_rows,
      audit_invalid_rows,
      audit_duplicate_rows,
      audit_consistent,
    },
    reconciled_at: new Date().toISOString(),
  };
}
