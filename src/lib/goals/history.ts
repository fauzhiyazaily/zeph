import type { Goal } from "@/lib/goals/goal-helpers";
import type { GoalProgress } from "@/lib/goals/progress";

export type GoalHistoryFilter = "all" | "completed" | "past" | "archived";

export type GoalHistoryStatus = "completed" | "past" | "archived";

export type GoalHistoryRow = {
  goal: Goal;
  progress: GoalProgress;
  status: GoalHistoryStatus;
};

export function isGoalCompleted(goal: Goal) {
  return Number(goal.current_amount) >= Number(goal.target_amount);
}

export function isGoalPastDeadline(goal: Goal, now = new Date()) {
  const deadline = new Date(`${goal.deadline}T00:00:00.000Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return deadline < today;
}

export function isGoalArchived(goal: Goal) {
  return Boolean(goal.archived_at);
}

function getGoalHistoryStatus(goal: Goal, now = new Date()): GoalHistoryStatus | null {
  if (isGoalArchived(goal)) {
    return "archived";
  }

  if (isGoalCompleted(goal)) {
    return "completed";
  }

  if (isGoalPastDeadline(goal, now)) {
    return "past";
  }

  return null;
}

export function buildGoalHistoryRows(rows: GoalProgress[], now = new Date()): GoalHistoryRow[] {
  return rows
    .map((row) => {
      const status = getGoalHistoryStatus(row.goal, now);
      if (!status) {
        return null;
      }

      return {
        goal: row.goal,
        progress: row,
        status,
      } satisfies GoalHistoryRow;
    })
    .filter((row): row is GoalHistoryRow => Boolean(row))
    .sort((a, b) =>
      new Date(b.goal.updated_at).getTime() - new Date(a.goal.updated_at).getTime(),
    );
}

export function filterGoalHistoryRows(rows: GoalHistoryRow[], filter: GoalHistoryFilter) {
  if (filter === "all") {
    return rows;
  }

  return rows.filter((row) => row.status === filter);
}
