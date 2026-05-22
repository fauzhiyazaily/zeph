export type Goal = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function validateGoalInput(input: {
  name: string;
  targetAmount: string | number;
  currentAmount: string | number;
  deadline: string;
  notes?: string | null;
}): string | null {
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return "Goal name must be between 2 and 120 characters.";
  }

  const targetAmount = Number(input.targetAmount);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return "Target amount must be a positive number.";
  }

  const currentAmount = Number(input.currentAmount);
  if (!Number.isFinite(currentAmount) || currentAmount < 0) {
    return "Current amount must be zero or a positive number.";
  }

  const deadlineText = String(input.deadline ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineText)) {
    return "Deadline must be a valid date in YYYY-MM-DD format.";
  }

  const [yearText, monthText, dayText] = deadlineText.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);

  const deadline = new Date(`${deadlineText}T00:00:00.000Z`);
  if (Number.isNaN(deadline.getTime())) {
    return "Deadline must be a valid date.";
  }

  if (
    deadline.getUTCFullYear() !== year
    || deadline.getUTCMonth() + 1 !== month
    || deadline.getUTCDate() !== day
  ) {
    return "Deadline must be a valid date.";
  }

  const minDate = new Date("2020-01-01T00:00:00.000Z");
  const maxDate = new Date("2100-12-31T00:00:00.000Z");
  if (deadline < minDate || deadline > maxDate) {
    return "Deadline must be between 2020-01-01 and 2100-12-31.";
  }

  const notes = String(input.notes ?? "").trim();
  if (notes.length > 500) {
    return "Notes must be 500 characters or fewer.";
  }

  return null;
}
