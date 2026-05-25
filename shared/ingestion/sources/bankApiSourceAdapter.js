import { createIngestionBatchId } from '../index.js';

export function bankApiSourceAdapter(event, context = {}) {
  return {
    merchant: event.merchant ?? event.counterparty ?? '',
    amount: event.amount,
    date: event.date ?? event.posted_at,
    reference: event.reference ?? event.transaction_id ?? null,
    source_type: 'bank_api',
    source_version: context.source_version ?? '1.0.0',
    ingested_at: context.ingested_at,
    ingestion_batch_id: context.ingestion_batch_id ?? createIngestionBatchId('bank_api'),
  };
}
