// Generate deterministic transaction fingerprints
import { createHash } from 'node:crypto';
import { normalizeMerchantName, normalizeAmount, normalizeDate, normalizeReferenceNumber } from './normalizeTransaction.js';

/**
 * Generate a unique fingerprint for a transaction based on normalized fields.
 * @param {Object} transaction - The transaction object.
 * @returns {string} - The fingerprint string.
 */
export function transactionFingerprint(transaction) {
  const normalizedMerchant = normalizeMerchantName(transaction.merchant);
  const normalizedAmount = normalizeAmount(transaction.amount);
  const normalizedDate = normalizeDate(transaction.date);
  const normalizedReference = normalizeReferenceNumber(transaction.reference);
  const payload = JSON.stringify({
    merchant: normalizedMerchant,
    amount: normalizedAmount,
    date: normalizedDate,
    reference: normalizedReference,
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function hasFingerprintCollision(existingFingerprintMap, fingerprint, transactionId) {
  if (!existingFingerprintMap.has(fingerprint)) {
    return false;
  }
  return existingFingerprintMap.get(fingerprint) !== transactionId;
}