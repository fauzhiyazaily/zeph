export type TransactionStatus = "categorized" | "uncategorized" | "flagged";

export type TransactionStatusInput = {
  category: string | null;
  aiClassification: "wise" | "useless" | null;
  aiReviewState: "pending" | "accepted" | "overridden";
};

export function getTransactionStatus(input: TransactionStatusInput): TransactionStatus {
  const normalizedCategory = (input.category ?? "").trim();
  if (normalizedCategory.length === 0) {
    return "uncategorized";
  }

  if (input.aiClassification === "useless" || input.aiReviewState === "overridden") {
    return "flagged";
  }

  return "categorized";
}