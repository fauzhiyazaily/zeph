// Duplicate detection logic using transaction fingerprints
import { transactionFingerprint } from './transactionFingerprint.js';

/**
 * Detect duplicate transactions based on fingerprints.
 * @param {Array} transactions - List of transaction objects.
 * @returns {Array} - List of duplicate transactions.
 */
export function detectDuplicates(transactions) {
  const seenFingerprints = new Set();
  const duplicates = [];

  for (const transaction of transactions) {
    const fingerprint = transactionFingerprint(transaction);
    if (seenFingerprints.has(fingerprint)) {
      duplicates.push(transaction);
    } else {
      seenFingerprints.add(fingerprint);
    }
  }

  return duplicates;
}