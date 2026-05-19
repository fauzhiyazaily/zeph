import { describe, expect, it, beforeEach } from "vitest";
import {
  FINGERPRINT_COLLISION_ALERT_THRESHOLD,
  getTelemetry,
  recordFingerprintCollision,
  resetTelemetry,
  runIngestionPipeline,
  transactionFingerprint,
} from "@/shared/ingestion/index";

describe("@governance ingestion runtime governance", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  it("produces deterministic hashed fingerprints", () => {
    const one = transactionFingerprint({
      merchant: " ACME Store ",
      amount: 101.5,
      date: "2026-05-10T11:22:33.000Z",
      reference: "  UTR-123 ",
    });

    const two = transactionFingerprint({
      merchant: "acme   store",
      amount: "101.50",
      date: "2026-05-10",
      reference: "UTR-123",
    });

    expect(one).toBe(two);
    expect(one).toMatch(/^[a-f0-9]{64}$/);
  });

  it("emits collision threshold alert once the threshold is reached", () => {
    for (let i = 0; i < FINGERPRINT_COLLISION_ALERT_THRESHOLD; i += 1) {
      recordFingerprintCollision();
    }

    const telemetry = getTelemetry();

    expect(telemetry.fingerprint_collision_count).toBe(FINGERPRINT_COLLISION_ALERT_THRESHOLD);
    expect(telemetry.alerts.length).toBeGreaterThan(0);
    expect(
      telemetry.alerts.some((alert) => alert.event === "ingestion.fingerprint_collision_threshold_exceeded"),
    ).toBe(true);
  });

  it("normalizes and validates through the canonical ingestion pipeline", () => {
    const result = runIngestionPipeline(
      {
        merchant: "  ACME   MARKET ",
        amount: "450.678",
        date: "2026-05-09T08:30:00.000Z",
        reference: "  abc-7788 ",
      },
      {
        source_type: "bank",
        source_version: "1.0.0",
        ingestion_batch_id: "batch:test:1",
        ingested_at: "2026-05-09T08:31:00.000Z",
      },
    );

    expect(result.normalized.merchant).toBe("acme market");
    expect(result.normalized.amount).toBe(450.68);
    expect(result.normalized.source_type).toBe("bank");
    expect(result.normalized.ingestion_batch_id).toBe("batch:test:1");
    expect(result.normalized.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.stages.validated).toBe(true);
  });
});
