import { describe, expect, it } from "vitest";
import { getTransactionStatus } from "@/lib/insights/transaction-status";

describe("transaction status helper", () => {
  it("returns uncategorized when no category is present", () => {
    expect(getTransactionStatus({
      category: null,
      aiClassification: "wise",
      aiReviewState: "accepted",
    })).toBe("uncategorized");
  });

  it("returns flagged for useless or overridden classified transactions", () => {
    expect(getTransactionStatus({
      category: "Food",
      aiClassification: "useless",
      aiReviewState: "accepted",
    })).toBe("flagged");

    expect(getTransactionStatus({
      category: "Bills",
      aiClassification: "wise",
      aiReviewState: "overridden",
    })).toBe("flagged");
  });

  it("returns categorized when category exists and no flagged signals exist", () => {
    expect(getTransactionStatus({
      category: "Groceries",
      aiClassification: "wise",
      aiReviewState: "accepted",
    })).toBe("categorized");
  });
});