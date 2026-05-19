import { beforeEach, describe, expect, it } from "vitest";
import {
  INGESTION_PIPELINE_VERSION,
  INGESTION_SCHEMA_VERSION,
  getTelemetry,
  recordDuplicateDetection,
  recordImportDuration,
  resetTelemetry,
  runIngestionPipeline,
  transactionFingerprint,
} from "@/shared/ingestion/index";

function assertIsoTimestamp(value: string) {
  expect(Number.isNaN(new Date(value).getTime())).toBe(false);
}

describe("@governance ingestion contract", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  it("attaches canonical metadata and stable fingerprint", () => {
    const result = runIngestionPipeline(
      {
        merchant: " Starbucks ",
        amount: "4.50",
        date: "2026-05-15T12:00:00Z",
        reference: " 12345 ",
      },
      {
        source_type: "sms",
        source_version: "2.1.0",
        ingestion_batch_id: "sms:batch:001",
        ingested_at: "2026-05-15T10:00:00.000Z",
      },
    );

    expect(result.normalized.ingestion_schema_version).toBe(INGESTION_SCHEMA_VERSION);
    expect(result.normalized.ingestion_pipeline_version).toBe(INGESTION_PIPELINE_VERSION);
    expect(result.normalized.source_type).toBe("sms");
    expect(result.normalized.source_version).toBe("2.1.0");
    expect(result.normalized.ingestion_batch_id).toBe("sms:batch:001");
    expect(result.normalized.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.normalized.fingerprint).toBe(transactionFingerprint(result.normalized));
    assertIsoTimestamp(result.normalized.ingested_at);
    assertIsoTimestamp(result.normalized.normalized_at);
  });

  it("keeps schema and pipeline versions stable across source paths", () => {
    const sms = runIngestionPipeline(
      { merchant: "Cafe", amount: 200, date: "2026-05-10", reference: "A1" },
      { source_type: "sms", source_version: "1.0.0" },
    );

    const csv = runIngestionPipeline(
      { merchant: "Cafe", amount: 200, date: "2026-05-10", reference: "A1" },
      { source_type: "csv", source_version: "1.0.0" },
    );

    expect(sms.normalized.ingestion_schema_version).toBe(csv.normalized.ingestion_schema_version);
    expect(sms.normalized.ingestion_pipeline_version).toBe(csv.normalized.ingestion_pipeline_version);
  });

  it("emits operational telemetry metrics with dashboard-friendly fields", () => {
    runIngestionPipeline(
      { merchant: "Store", amount: 155, date: "2026-05-17", reference: "ZX-11" },
      { source_type: "sms", source_version: "1.0.0", ingestion_batch_id: "sms:101" },
    );

    recordDuplicateDetection(true);
    recordImportDuration(325);

    const snapshot = getTelemetry();
    expect(snapshot.pipeline_success_rate).toBe(1);
    expect(snapshot.duplicate_rate).toBe(1);
    expect(snapshot.average_import_duration).toBe(325);
    expect(snapshot.batch_failure_rate).toBe(0);
    expect(snapshot.replay_success_rate).toBe(0);
  });
});
