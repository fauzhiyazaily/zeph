export type Budget = {
  id: string;
  user_id: string;
  category: string;
  month: string; // "YYYY-MM"
  amount_limit: number;
  created_at: string;
  updated_at: string;
};

/**
 * Returns the "YYYY-MM" key for a given Date (defaults to today).
 */
export function currentMonthKey(from: Date = new Date()): string {
  return from.toISOString().slice(0, 7);
}

/**
 * Validate a budget form submission.
 * Returns an error message string or null if valid.
 */
export function validateBudgetInput(input: {
  category: string;
  month: string;
  amountLimit: string | number;
}): string | null {
  const category = String(input.category).trim();
  if (!category || category.length > 80) {
    return "Category is required and must be 80 characters or fewer.";
  }

  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    return "Month must be in YYYY-MM format.";
  }

  const year = parseInt(input.month.slice(0, 4), 10);
  const month = parseInt(input.month.slice(5, 7), 10);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) {
    return "Month value is out of range.";
  }

  const limit = Number(input.amountLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return "Budget limit must be a positive number.";
  }

  if (limit > 9_999_999_99) {
    return "Budget limit is too large.";
  }

  return null;
}
