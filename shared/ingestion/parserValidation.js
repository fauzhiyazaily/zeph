// Parser validation logic for transactions

// CSV injection protection

/**
 * Sanitize fields to prevent CSV injection.
 * @param {string} field - The field to sanitize.
 * @returns {string} - The sanitized field.
 */
function sanitizeField(field) {
  if (field === null || field === undefined) {
    return '';
  }
  const value = String(field);
  const dangerousPrefixes = ['=', '+', '-', '@'];
  if (dangerousPrefixes.includes(value[0])) {
    return `'${value}`; // Prefix with a single quote to neutralize formulas
  }
  return value;
}

/**
 * Validate a transaction object.
 * @param {Object} transaction - The transaction to validate.
 * @throws {Error} - If validation fails.
 */
export function validateTransaction(transaction) {
  const errors = [];

  if (!transaction.merchant || transaction.merchant.trim().length === 0) {
    errors.push('Merchant is required.');
  }

  if (!transaction.amount || isNaN(transaction.amount) || Number(transaction.amount) <= 0) {
    errors.push('Amount must be a positive number.');
  }

  if (!transaction.date || isNaN(Date.parse(transaction.date))) {
    errors.push('Date must be a valid timestamp.');
  }

  // Sanitize fields
  transaction.merchant = sanitizeField(transaction.merchant);
  transaction.reference = sanitizeField(transaction.reference || '');

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  return true;
}