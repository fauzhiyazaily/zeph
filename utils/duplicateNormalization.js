// Utility functions for duplicate normalization

/**
 * Normalize merchant names by trimming whitespace and converting to lowercase.
 * @param {string} merchantName
 * @returns {string}
 */
export const normalizeMerchantName = (merchantName) => {
  return merchantName.trim().toLowerCase();
};

/**
 * Normalize dates to ISO format.
 * @param {string} date
 * @returns {string}
 */
export const normalizeDate = (date) => {
  const parsedDate = new Date(date);
  return parsedDate.toISOString().split('T')[0];
};

/**
 * Normalize floating-point amounts to fixed precision.
 * @param {number|string} amount
 * @returns {number}
 */
export const normalizeAmount = (amount) => {
  return parseFloat(parseFloat(amount).toFixed(2));
};

/**
 * Normalize reference numbers by trimming whitespace.
 * @param {string} referenceNumber
 * @returns {string}
 */
export const normalizeReferenceNumber = (referenceNumber) => {
  return referenceNumber ? referenceNumber.trim() : null;
};

/**
 * Normalize a transaction object for duplicate detection.
 * @param {object} transaction
 * @returns {object}
 */
export const normalizeTransaction = (transaction) => {
  return {
    ...transaction,
    merchant_name: normalizeMerchantName(transaction.merchant_name),
    transaction_date: normalizeDate(transaction.transaction_date),
    amount: normalizeAmount(transaction.amount),
    reference_number: normalizeReferenceNumber(transaction.reference_number),
  };
};