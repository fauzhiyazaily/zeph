import { createIngestionBatchId } from '../index.js';

export function ocrSourceAdapter(extractedRow, context = {}) {
  return {
    merchant: extractedRow.merchant ?? extractedRow.description ?? '',
    amount: extractedRow.amount,
    date: extractedRow.date,
    reference: extractedRow.reference ?? null,
    source_type: 'ocr',
    source_version: context.source_version ?? '1.0.0',
    ingested_at: context.ingested_at,
    ingestion_batch_id: context.ingestion_batch_id ?? createIngestionBatchId('ocr'),
  };
}
