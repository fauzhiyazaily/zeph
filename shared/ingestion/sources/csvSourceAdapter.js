import { createIngestionBatchId } from '../index.js';

export function csvSourceAdapter(row, context = {}) {
  return {
    merchant: row.merchant ?? row.description ?? '',
    amount: row.amount,
    date: row.date ?? row.posted_at,
    reference: row.reference ?? row.ref ?? null,
    source_type: 'csv',
    source_version: context.source_version ?? '1.0.0',
    ingested_at: context.ingested_at,
    ingestion_batch_id: context.ingestion_batch_id ?? createIngestionBatchId('csv'),
  };
}
