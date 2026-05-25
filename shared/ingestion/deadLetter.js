const deadLetterQueue = [];

export function pushDeadLetterRecord(record) {
  deadLetterQueue.push({
    ...record,
    retry_count: 0,
    last_retried_at: null,
    queued_at: new Date().toISOString(),
  });
}

export function getDeadLetterRecords() {
  return [...deadLetterQueue];
}

/**
 * Mark a dead-letter record as retried and return it for replay.
 * Identifies records by ingestion_batch_id (+ optional row index for batches).
 * Returns null if not found.
 */
export function retryDeadLetterRecord(ingestionBatchId, rowIndex = 0) {
  const matches = deadLetterQueue.filter((r) => r.ingestion_batch_id === ingestionBatchId);
  const record = matches[rowIndex] ?? null;

  if (!record) {
    return null;
  }

  const queueIndex = deadLetterQueue.indexOf(record);
  const retried = {
    ...record,
    retry_count: (record.retry_count ?? 0) + 1,
    last_retried_at: new Date().toISOString(),
  };

  deadLetterQueue[queueIndex] = retried;
  return retried;
}

/**
 * Remove a successfully replayed dead-letter record from the queue.
 */
export function removeDeadLetterRecord(ingestionBatchId, rowIndex = 0) {
  const matches = deadLetterQueue
    .map((r, i) => ({ record: r, index: i }))
    .filter(({ record }) => record.ingestion_batch_id === ingestionBatchId);

  const target = matches[rowIndex] ?? null;
  if (!target) {
    return false;
  }

  deadLetterQueue.splice(target.index, 1);
  return true;
}

export function resetDeadLetterRecords() {
  deadLetterQueue.length = 0;
}
