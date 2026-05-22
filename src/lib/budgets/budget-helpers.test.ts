import { describe, expect, it } from "vitest";
import { validateBudgetInput } from "@/lib/budgets/budget-helpers";

describe("validateBudgetInput", () => {
  it("accepts valid budget input", () => {
    const result = validateBudgetInput({
      category: "Food",
      month: "2026-05",
      amountLimit: "5000",
    });

    expect(result).toBeNull();
  });

  it("rejects empty category", () => {
    const result = validateBudgetInput({
      category: "   ",
      month: "2026-05",
      amountLimit: "5000",
    });

    expect(result).toBe("Category is required and must be 80 characters or fewer.");
  });

  it("rejects malformed month", () => {
    const result = validateBudgetInput({
      category: "Food",
      month: "2026/05",
      amountLimit: "5000",
    });

    expect(result).toBe("Month must be in YYYY-MM format.");
  });

  it("rejects invalid limit values", () => {
    const result = validateBudgetInput({
      category: "Food",
      month: "2026-05",
      amountLimit: "0",
    });

    expect(result).toBe("Budget limit must be a positive number.");
  });
});
