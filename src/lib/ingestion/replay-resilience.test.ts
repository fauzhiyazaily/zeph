import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTelemetry,
  replayIngestionPipeline,
  resetTelemetry,
  runIngestionPipeline,
  transactionFingerprint,
} from "@/shared/ingestion/index";

describe("@governance replay resilience", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  it("produces deterministic replay outputs for stable handlers", async () => {
    const base = runIngestionPipeline(
      {
        merchant: "Acme Store",
        amount: "199.50",
        date: "2026-05-15T08:30:00.000Z",
        reference: "UTR-991",
      },
      {
        source_type: "sms",
        source_version: "1.0.0",
        ingestion_batch_id: "batch:replay:1",
        ingested_at: "2026-05-15T08:30:05.000Z",
      },
    );

    const handlers = {
      detectDuplicate: vi.fn(async () => ({ duplicate: false, collision: false })),
      categorize: vi.fn(async () => ({ category: "Shopping" })),
      analyzeWithAI: vi.fn(async () => ({ label: "wise", confidence: 0.91 })),
    };

    const first = await replayIngestionPipeline(base.normalized, handlers);
    const second = await replayIngestionPipeline(base.normalized, handlers);

    expect(first).toEqual(second);
  });

  it("preserves metadata and fingerprint stability through replay", async () => {
    const base = runIngestionPipeline(
      {
        merchant: "Blue Tokai",
        amount: 240,
        date: "2026-05-14T10:00:00.000Z",
        reference: "REF-5543",
      },
      {
        source_type: "bank",
        source_version: "1.1.0",
        ingestion_batch_id: "batch:replay:2",
        ingested_at: "2026-05-14T10:00:01.000Z",
      },
    );

    const replayed = await replayIngestionPipeline(base.normalized, {
      detectDuplicate: async () => ({ duplicate: false, collision: false }),
    });

    expect(replayed.normalized.ingestion_batch_id).toBe("batch:replay:2");
    expect(replayed.normalized.source_type).toBe("bank");
    expect(replayed.normalized.source_version).toBe("1.1.0");
    expect(replayed.normalized.fingerprint).toBe(transactionFingerprint(replayed.normalized));
  });

  it("captures replay failures and supports subsequent recovery", async () => {
    const base = runIngestionPipeline(
      {
        merchant: "Metro Cash",
        amount: 750,
        date: "2026-05-16T11:10:00.000Z",
        reference: "R-22",
      },
      {
        source_type: "manual",
        source_version: "1.0.0",
        ingestion_batch_id: "batch:replay:3",
        ingested_at: "2026-05-16T11:10:05.000Z",
      },
    );

    await expect(
      replayIngestionPipeline(base.normalized, {
        categorize: async () => {
          throw new Error("classifier unavailable");
        },
      }),
    ).rejects.toThrow("classifier unavailable");

    const recovered = await replayIngestionPipeline(base.normalized, {
      categorize: async () => ({ category: "Utilities" }),
    });

    expect(recovered.categorization).toEqual({ category: "Utilities" });

    const telemetry = getTelemetry();
    expect(telemetry.replay_success_rate).toBe(0.5);
    expect(telemetry.replay_failure_rate).toBe(0.5);
    expect(telemetry.events.some((event) => event.event === "ingestion.replay_failed")).toBe(true);
  });

  it("is replay-idempotent for equivalent normalized payloads", async () => {
    const base = runIngestionPipeline(
      {
        merchant: "A2B Restaurant",
        amount: 860,
        date: "2026-05-11T19:20:00.000Z",
        reference: "UPI-88",
      },
      {
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_batch_id: "batch:replay:4",
        ingested_at: "2026-05-11T19:20:03.000Z",
      },
    );

    const outputA = await replayIngestionPipeline(base.normalized, {
      detectDuplicate: async () => ({ duplicate: false, collision: false }),
    });

    const outputB = await replayIngestionPipeline({ ...base.normalized }, {
      detectDuplicate: async () => ({ duplicate: false, collision: false }),
    });

    expect(outputA).toEqual(outputB);
  });
});
