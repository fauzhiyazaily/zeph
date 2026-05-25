import { INGESTION_PIPELINE_VERSION, INGESTION_SCHEMA_VERSION } from './constants.js';
import { createHash } from 'node:crypto';

// Centralized normalization logic for transactions.
// Every ingestion path should emit this normalized contract.

/**
 * Normalize merchant names by trimming whitespace and converting to lowercase.
 * @param {string} merchantName
 * @returns {string}
 */
export const normalizeMerchantName = (merchantName) => {
  if (typeof merchantName !== 'string') {
    return '';
  }
  return merchantName
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Normalize dates to ISO format.
 * @param {string} date
 * @returns {string}
 */
export const normalizeDate = (date) => {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }
  return parsedDate.toISOString().split('T')[0];
};

/**
 * Normalize floating-point amounts to fixed precision.
 * @param {number|string} amount
 * @returns {number}
 */
export const normalizeAmount = (amount) => {
  const parsed = parseFloat(amount);
  if (Number.isNaN(parsed)) {
    return NaN;
  }
  return parseFloat(parsed.toFixed(2));
};

/**
 * Normalize reference numbers by trimming whitespace.
 * @param {string} referenceNumber
 * @returns {string}
 */
export const normalizeReferenceNumber = (referenceNumber) => {
  return referenceNumber ? String(referenceNumber).trim() : null;
};

function buildFingerprint(merchant, amount, date, reference) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        merchant,
        amount,
        date,
        reference,
      }),
    )
    .digest('hex');
}

export function createIngestionBatchId(sourceType = 'unknown') {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${sourceType}:${stamp}:${rand}`;
}

/**
 * Normalize transaction fields and attach canonical ingestion metadata.
 * @param {Object} transaction - The transaction object.
 * @param {Object} options - Normalization context.
 * @returns {Object} - The normalized transaction with ingestion metadata.
 */
export function normalizeTransaction(transaction, options = {}) {
  const sourceType = options.source_type ?? transaction.source_type ?? 'unknown';
  const sourceVersion = options.source_version ?? transaction.source_version ?? '1.0.0';
  const ingestedAt = options.ingested_at ?? transaction.ingested_at ?? new Date().toISOString();
  const normalizedAt = options.normalized_at ?? new Date().toISOString();
  const ingestionBatchId = options.ingestion_batch_id ?? transaction.ingestion_batch_id ?? createIngestionBatchId(sourceType);

  const merchant = normalizeMerchantName(transaction.merchant);
  const amount = normalizeAmount(transaction.amount);
  const date = normalizeDate(transaction.date);
  const reference = normalizeReferenceNumber(transaction.reference);
  const fingerprint = buildFingerprint(merchant, amount, date, reference);

  return {
    ...transaction,
    merchant,
    amount,
    date,
    reference,
    fingerprint,
    ingestion_schema_version: INGESTION_SCHEMA_VERSION,
    ingestion_pipeline_version: INGESTION_PIPELINE_VERSION,
    source_type: sourceType,
    source_version: sourceVersion,
    ingestion_batch_id: ingestionBatchId,
    ingested_at: ingestedAt,
    normalized_at: normalizedAt,
  };
}