import { createIngestionBatchId } from '../index.js';

export function manualEntrySourceAdapter(entry, context = {}) {
  return {
    merchant: entry.merchant,
    amount: entry.amount,
    date: entry.date,
    reference: entry.reference ?? null,
    source_type: 'manual',
    source_version: context.source_version ?? '1.0.0',
    ingested_at: context.ingested_at,
    ingestion_batch_id: context.ingestion_batch_id ?? createIngestionBatchId('manual'),
  };
}
