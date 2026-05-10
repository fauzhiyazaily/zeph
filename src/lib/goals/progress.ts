import type { Goal } from "@/lib/goals/goal-helpers";

export type GoalProgress = {
  goal: Goal;
  percent: number;
  remaining: number;
  isCompleted: boolean;
  daysRemaining: number;
  requiredPerDay: number;
  statusLabel: string;
};

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function computeGoalProgress(goal: Goal, now = new Date()): GoalProgress {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);

  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
  const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;

  const isCompleted = safeTarget > 0 && safeCurrent >= safeTarget;
  const percent = safeTarget > 0 ? Math.min(100, Math.round((safeCurrent / safeTarget) * 100)) : 0;
  const remaining = Math.max(0, safeTarget - safeCurrent);

  const deadline = new Date(`${goal.deadline}T00:00:00.000Z`);
  const today = startOfDay(now);
  const due = startOfDay(deadline);

  const daysRemainingRaw = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Number.isFinite(daysRemainingRaw) ? daysRemainingRaw : 0;

  const denominator = Math.max(1, daysRemaining);
  const requiredPerDay = remaining > 0 ? Number((remaining / denominator).toFixed(2)) : 0;

  let statusLabel = "On track";
  if (isCompleted) {
    statusLabel = "Completed";
  } else if (daysRemaining < 0 && remaining > 0) {
    statusLabel = "Past deadline";
  } else if (daysRemaining <= 7 && remaining > 0) {
    statusLabel = "Due soon";
  }

  return {
    goal,
    percent,
    remaining,
    isCompleted,
    daysRemaining,
    requiredPerDay,
    statusLabel,
  };
}

export function summarizeGoalProgress(rows: GoalProgress[]) {
  const totalGoals = rows.length;
  const completedGoals = rows.filter((row) => row.isCompleted).length;
  const activeRows = rows.filter((row) => !row.isCompleted);

  const avgProgress = totalGoals > 0
    ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / totalGoals)
    : 0;

  const dueSoonCount = activeRows.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length;

  return {
    totalGoals,
    completedGoals,
    avgProgress,
    dueSoonCount,
  };
}
