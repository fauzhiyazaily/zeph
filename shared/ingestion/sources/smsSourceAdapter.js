import { createIngestionBatchId } from '../index.js';

export function smsSourceAdapter(messagePayload, context = {}) {
  return {
    merchant: messagePayload.merchant,
    amount: messagePayload.amount,
    date: messagePayload.timestamp ?? context.received_at,
    reference: messagePayload.reference ?? null,
    source_type: 'sms',
    source_version: context.source_version ?? '1.0.0',
    ingested_at: context.ingested_at,
    ingestion_batch_id: context.ingestion_batch_id ?? createIngestionBatchId('sms'),
  };
}
