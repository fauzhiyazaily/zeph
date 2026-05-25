import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceServerSecretPolicyMock = vi.fn();
const logAuditEventMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const getIngestionHealthSnapshotMock = vi.fn();

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/ingestion/health", () => ({
  getIngestionHealthSnapshot: () => getIngestionHealthSnapshotMock(),
}));

const baseSnapshot = {
  pipeline_success_rate: 0.99,
  duplicate_detection_rate: 0.1,
  duplicate_rate: 0.05,
  average_import_duration: 42,
  batch_failure_rate: 0.01,
  replay_success_rate: 0.98,
  fingerprint_collision_count: 0,
  dead_letter_count: 0,
  high_duplicate_rate: false,
  high_invalid_rate: false,
  collision_spike: false,
  overall_severity: "info",
  anomalies: [],
  sampled_at: "2026-05-25T10:00:00.000Z",
};

describe("GET /api/ingestion/health", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { GET } = await import("@/app/api/ingestion/health/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ingestion_health_denied" }),
    );
  });

  it("returns 200 with health snapshot for authenticated user", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
    });
    getIngestionHealthSnapshotMock.mockReturnValue(baseSnapshot);

    const { GET } = await import("@/app/api/ingestion/health/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pipeline_success_rate).toBe(0.99);
    expect(body.overall_severity).toBe("info");
    expect(body.anomalies).toEqual([]);
  });

  it("sets Cache-Control: no-store and X-Ingestion-Severity response headers", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
    });
    getIngestionHealthSnapshotMock.mockReturnValue({
      ...baseSnapshot,
      overall_severity: "warning",
    });

    const { GET } = await import("@/app/api/ingestion/health/route");
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Ingestion-Severity")).toBe("warning");
  });

  it("includes anomaly entries when the snapshot has warnings", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
    });
    const snapshotWithAnomalies = {
      ...baseSnapshot,
      overall_severity: "critical",
      anomalies: [
        {
          level: "critical",
          event: "high_duplicate_rate",
          threshold: 0.3,
          actual: 0.65,
          timestamp: "2026-05-25T09:00:00.000Z",
        },
      ],
    };
    getIngestionHealthSnapshotMock.mockReturnValue(snapshotWithAnomalies);

    const { GET } = await import("@/app/api/ingestion/health/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.anomalies).toHaveLength(1);
    expect(body.anomalies[0].event).toBe("high_duplicate_rate");
    expect(body.overall_severity).toBe("critical");
  });
});
