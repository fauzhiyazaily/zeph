import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "@/lib/audit";
import type { GoalProgress } from "@/lib/goals/progress";

export type GoalMilestoneRow = {
  id: string;
  user_id: string;
  goal_id: string;
  milestone: 25 | 50 | 75 | 100;
  progress_percent: number;
  message: string;
  created_at: string;
};

const MILESTONES: Array<25 | 50 | 75 | 100> = [25, 50, 75, 100];

function buildMilestoneMessage(input: { goalName: string; milestone: 25 | 50 | 75 | 100 }) {
  if (input.milestone === 100) {
    return `Goal completed: ${input.goalName}. Outstanding work.`;
  }
  return `Milestone reached: ${input.goalName} at ${input.milestone}%. Keep going.`;
}

export async function evaluateGoalMilestones(input: {
  supabase: SupabaseClient;
  userId: string;
  rows: GoalProgress[];
}): Promise<{ generatedCount: number }> {
  let generatedCount = 0;

  for (const row of input.rows) {
    for (const milestone of MILESTONES) {
      if (row.percent < milestone) {
        continue;
      }

      const message = buildMilestoneMessage({
        goalName: row.goal.name,
        milestone,
      });

      const { error } = await input.supabase.from("goal_milestones").insert({
        user_id: input.userId,
        goal_id: row.goal.id,
        milestone,
        progress_percent: row.percent,
        message,
      });

      if (error) {
        if (error.code === "23505") {
          continue;
        }
        continue;
      }

      generatedCount += 1;
      logAuditEvent({
        event: "goal_milestone_triggered",
        userId: input.userId,
        route: "/goals",
        metadata: {
          goalId: row.goal.id,
          goalName: row.goal.name,
          milestone,
          progressPercent: row.percent,
        },
      });
    }
  }

  return { generatedCount };
}
