import { describe, expect, it } from "vitest";
import { reconcileIngestionBatch } from "@/shared/ingestion/index";

describe("@governance ingestion batch reconciliation", () => {
  it("reconciles imported, duplicate, invalid and replay deltas", () => {
    const summary = reconcileIngestionBatch({
      ingestion_batch_id: "bank:batch:42",
      total_rows: 16,
      imported_rows: 10,
      duplicate_skips: 3,
      failed_rows: 2,
      replay_differences: 1,
      audit_log: {
        valid_rows: 10,
        invalid_rows: 2,
        duplicate_rows: 3,
      },
    });

    expect(summary.ingestion_batch_id).toBe("bank:batch:42");
    expect(summary.imported_rows).toBe(10);
    expect(summary.duplicate_skips).toBe(3);
    expect(summary.failed_rows).toBe(2);
    expect(summary.replay_differences).toBe(1);
    expect(summary.unmatched_rows).toBe(1);
    expect(summary.audit_log_consistency.audit_consistent).toBe(true);
  });

  it("flags audit-log inconsistency when runtime and audit counts diverge", () => {
    const summary = reconcileIngestionBatch({
      ingestion_batch_id: "batch:inconsistent",
      total_rows: 4,
      imported_rows: 2,
      duplicate_skips: 1,
      failed_rows: 1,
      replay_differences: 0,
      audit_log: {
        valid_rows: 3,
        invalid_rows: 0,
        duplicate_rows: 1,
      },
    });

    expect(summary.audit_log_consistency.audit_consistent).toBe(false);
    expect(summary.audit_log_consistency.audit_valid_rows).toBe(3);
  });
});
