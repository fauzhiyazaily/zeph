import { beforeEach, describe, expect, it } from "vitest";
import {
  COLLISION_SPIKE_THRESHOLD,
  FINGERPRINT_COLLISION_ALERT_THRESHOLD,
  getTelemetry,
  recordFingerprintCollision,
  resetTelemetry,
} from "@/shared/ingestion/index";

describe("@governance fingerprint collision controls", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  it("emits collision threshold warning when guardrail is crossed", () => {
    for (let i = 0; i < FINGERPRINT_COLLISION_ALERT_THRESHOLD; i += 1) {
      recordFingerprintCollision();
    }

    const telemetry = getTelemetry();

    expect(telemetry.fingerprint_collision_count).toBe(FINGERPRINT_COLLISION_ALERT_THRESHOLD);
    expect(telemetry.alerts.some((alert) => alert.event === "ingestion.fingerprint_collision_threshold_exceeded")).toBe(true);
  });

  it("marks collision spikes for operational telemetry", () => {
    for (let i = 0; i < COLLISION_SPIKE_THRESHOLD; i += 1) {
      recordFingerprintCollision();
    }

    const telemetry = getTelemetry();

    expect(telemetry.collision_spike).toBe(true);
    expect(telemetry.alerts.some((alert) => alert.event === "ingestion.collision_spike")).toBe(true);
  });
});
