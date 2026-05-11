import { describe, it, expect } from "vitest";
import {
  buildGoalHistoryRows,
  filterGoalHistoryRows,
  isGoalArchived,
  isGoalCompleted,
  isGoalPastDeadline,
} from "@/lib/goals/history";
import { computeGoalProgress } from "@/lib/goals/progress";
import type { Goal } from "@/lib/goals/goal-helpers";

function createTestGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "test-" + Math.random().toString(36).slice(2),
    user_id: "user-1",
    name: "Test Goal",
    target_amount: 10000,
    current_amount: 5000,
    deadline: "2026-12-31",
    notes: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
    ...overrides,
  };
}

describe("Goal History Filtering", () => {
  describe("isGoalCompleted", () => {
    it("should return true when current_amount >= target_amount", () => {
      const goal = createTestGoal({ current_amount: 10000, target_amount: 10000 });
      expect(isGoalCompleted(goal)).toBe(true);
    });

    it("should return false when current_amount < target_amount", () => {
      const goal = createTestGoal({ current_amount: 5000, target_amount: 10000 });
      expect(isGoalCompleted(goal)).toBe(false);
    });

    it("should return true when current_amount exceeds target_amount", () => {
      const goal = createTestGoal({ current_amount: 15000, target_amount: 10000 });
      expect(isGoalCompleted(goal)).toBe(true);
    });
  });

  describe("isGoalPastDeadline", () => {
    it("should return true when deadline is in the past", () => {
      const now = new Date("2026-06-01T00:00:00Z");
      const goal = createTestGoal({ deadline: "2026-05-01" });
      expect(isGoalPastDeadline(goal, now)).toBe(true);
    });

    it("should return false when deadline is in the future", () => {
      const now = new Date("2026-05-01T00:00:00Z");
      const goal = createTestGoal({ deadline: "2026-06-01" });
      expect(isGoalPastDeadline(goal, now)).toBe(false);
    });

    it("should return false when deadline is today", () => {
      const now = new Date("2026-05-10T12:00:00Z");
      const goal = createTestGoal({ deadline: "2026-05-10" });
      expect(isGoalPastDeadline(goal, now)).toBe(false);
    });
  });

  describe("isGoalArchived", () => {
    it("should return true when archived_at is set", () => {
      const goal = createTestGoal({ archived_at: "2026-05-10T10:00:00Z" });
      expect(isGoalArchived(goal)).toBe(true);
    });

    it("should return false when archived_at is null", () => {
      const goal = createTestGoal({ archived_at: null });
      expect(isGoalArchived(goal)).toBe(false);
    });
  });

  describe("buildGoalHistoryRows", () => {
    it("should exclude active (non-historical) goals", () => {
      const activeGoal = createTestGoal({
        current_amount: 3000,
        target_amount: 10000,
        deadline: "2026-12-31",
        archived_at: null,
      });

      const progressRows = [computeGoalProgress(activeGoal)];
      const historyRows = buildGoalHistoryRows(progressRows);

      expect(historyRows).toHaveLength(0);
    });

    it("should include completed goals", () => {
      const completedGoal = createTestGoal({
        current_amount: 10000,
        target_amount: 10000,
        archived_at: null,
      });

      const progressRows = [computeGoalProgress(completedGoal)];
      const historyRows = buildGoalHistoryRows(progressRows);

      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].status).toBe("completed");
    });

    it("should include past deadline goals", () => {
      const now = new Date("2026-06-01T00:00:00Z");
      const pastGoal = createTestGoal({
        current_amount: 3000,
        target_amount: 10000,
        deadline: "2026-05-01",
        archived_at: null,
      });

      const progressRows = [computeGoalProgress(pastGoal)];
      const historyRows = buildGoalHistoryRows(progressRows, now);

      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].status).toBe("past");
    });

    it("should include archived goals", () => {
      const archivedGoal = createTestGoal({
        current_amount: 3000,
        target_amount: 10000,
        archived_at: "2026-05-10T10:00:00Z",
      });

      const progressRows = [computeGoalProgress(archivedGoal)];
      const historyRows = buildGoalHistoryRows(progressRows);

      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].status).toBe("archived");
    });

    it("should prioritize archived status over completion", () => {
      const archivedCompletedGoal = createTestGoal({
        current_amount: 10000,
        target_amount: 10000,
        archived_at: "2026-05-10T10:00:00Z",
      });

      const progressRows = [computeGoalProgress(archivedCompletedGoal)];
      const historyRows = buildGoalHistoryRows(progressRows);

      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].status).toBe("archived");
    });

    it("should sort by updated_at descending", () => {
      const goal1 = createTestGoal({
        id: "goal-1",
        current_amount: 10000,
        target_amount: 10000,
        updated_at: "2026-05-01T00:00:00Z",
      });

      const goal2 = createTestGoal({
        id: "goal-2",
        current_amount: 10000,
        target_amount: 10000,
        updated_at: "2026-05-10T00:00:00Z",
      });

      const progressRows = [
        computeGoalProgress(goal1),
        computeGoalProgress(goal2),
      ];
      const historyRows = buildGoalHistoryRows(progressRows);

      expect(historyRows[0].goal.id).toBe("goal-2");
      expect(historyRows[1].goal.id).toBe("goal-1");
    });
  });

  describe("filterGoalHistoryRows", () => {
    const now = new Date("2026-06-01T00:00:00Z");

    const completedGoal = createTestGoal({
      id: "completed",
      current_amount: 10000,
      target_amount: 10000,
    });

    const pastGoal = createTestGoal({
      id: "past",
      current_amount: 3000,
      target_amount: 10000,
      deadline: "2026-05-01",
    });

    const archivedGoal = createTestGoal({
      id: "archived",
      archived_at: "2026-05-10T10:00:00Z",
    });

    const progressRows = [
      computeGoalProgress(completedGoal),
      computeGoalProgress(pastGoal),
      computeGoalProgress(archivedGoal),
    ];

    const allRows = buildGoalHistoryRows(progressRows, now);

    it("should return all rows when filter is 'all'", () => {
      const filtered = filterGoalHistoryRows(allRows, "all");
      expect(filtered).toHaveLength(3);
    });

    it("should filter completed goals", () => {
      const filtered = filterGoalHistoryRows(allRows, "completed");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("completed");
    });

    it("should filter past deadline goals", () => {
      const filtered = filterGoalHistoryRows(allRows, "past");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("past");
    });

    it("should filter archived goals", () => {
      const filtered = filterGoalHistoryRows(allRows, "archived");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("archived");
    });
  });

  describe("Search and Filter Integration", () => {
    it("should support filtering and then searching", () => {
      const now = new Date("2026-06-01T00:00:00Z");

      const goal1 = createTestGoal({
        id: "retirement",
        name: "Retirement Fund",
        current_amount: 10000,
        target_amount: 10000,
      });

      const goal2 = createTestGoal({
        id: "vacation",
        name: "Vacation Savings",
        current_amount: 5000,
        target_amount: 10000,
      });

      const progressRows = [
        computeGoalProgress(goal1),
        computeGoalProgress(goal2),
      ];

      const allRows = buildGoalHistoryRows(progressRows, now);
      const completedFiltered = filterGoalHistoryRows(allRows, "completed");

      // Simulate search: filter rows by name containing "retirement"
      const searchResult = completedFiltered.filter((row) =>
        row.goal.name.toLowerCase().includes("retirement")
      );

      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].goal.name).toBe("Retirement Fund");
    });
  });

  describe("Pagination Simulation", () => {
    it("should support paginating through results", () => {
      const goals = Array.from({ length: 25 }, (_, i) =>
        createTestGoal({
          id: `goal-${i}`,
          name: `Goal ${i}`,
          current_amount: 10000,
          target_amount: 10000,
          updated_at: new Date(2026, 4, 25 - i).toISOString(),
        })
      );

      const progressRows = goals.map((g) => computeGoalProgress(g));
      const allRows = buildGoalHistoryRows(progressRows);

      const pageSize = 12;
      const page1 = allRows.slice(0, pageSize);
      const page2 = allRows.slice(pageSize, pageSize * 2);
      const page3 = allRows.slice(pageSize * 2);

      expect(page1).toHaveLength(12);
      expect(page2).toHaveLength(12);
      expect(page3).toHaveLength(1);
      expect(page1[0].goal.id).toBe("goal-0");
      expect(page2[0].goal.id).toBe("goal-12");
      expect(page3[0].goal.id).toBe("goal-24");
    });
  });
});
