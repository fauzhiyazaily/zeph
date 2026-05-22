import { describe, expect, it } from "vitest";
import { validateGoalInput } from "@/lib/goals/goal-helpers";

describe("validateGoalInput", () => {
  it("accepts valid goal input", () => {
    const result = validateGoalInput({
      name: "Emergency Fund",
      targetAmount: "100000",
      currentAmount: "25000",
      deadline: "2026-12-31",
      notes: "Build six months of runway",
    });

    expect(result).toBeNull();
  });

  it("rejects non-positive target amounts", () => {
    const result = validateGoalInput({
      name: "Emergency Fund",
      targetAmount: "0",
      currentAmount: "0",
      deadline: "2026-12-31",
    });

    expect(result).toBe("Target amount must be a positive number.");
  });

  it("rejects malformed deadline format", () => {
    const result = validateGoalInput({
      name: "Emergency Fund",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2026/12/31",
    });

    expect(result).toBe("Deadline must be a valid date in YYYY-MM-DD format.");
  });

  it("rejects impossible calendar dates", () => {
    const result = validateGoalInput({
      name: "Emergency Fund",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2026-02-31",
    });

    expect(result).toBe("Deadline must be a valid date.");
  });
});
