import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

function buildTransactionsBuilder(result: { data: unknown; error: unknown }) {
  const orderMock = vi.fn().mockResolvedValue(result);
  const ltMock = vi.fn().mockReturnValue({ order: orderMock });
  const gteMock = vi.fn().mockReturnValue({ lt: ltMock });
  const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

  return {
    builder: { select: selectMock },
    eqMock,
  };
}

describe("GET /api/reports/export", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns user-scoped CSV export for selected period", async () => {
    const transactions = buildTransactionsBuilder({
      data: [
        {
          id: "tx-1",
          date: "2026-05-22T10:00:00.000Z",
          merchant: "Cafe Nero",
          amount: 120,
          source: "card",
          category: "Food",
          ai_classification: "wise",
          ai_review_state: "accepted",
          reference: "REF123",
        },
      ],
      error: null,
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => transactions.builder),
    });

    const { GET } = await import("@/app/api/reports/export/route");
    const response = await GET(new Request("http://localhost:3000/api/reports/export?format=csv&period=this"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    await expect(response.text()).resolves.toContain("Cafe Nero");
    expect(transactions.eqMock).toHaveBeenCalledWith("user_id", "u1");
  });

  it("returns PDF export bytes for selected period", async () => {
    const transactions = buildTransactionsBuilder({
      data: [
        {
          id: "tx-1",
          date: "2026-05-22T10:00:00.000Z",
          merchant: "Cafe Nero",
          amount: 120,
          source: "card",
          category: "Food",
          ai_classification: "wise",
          ai_review_state: "accepted",
          reference: "REF123",
        },
      ],
      error: null,
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => transactions.builder),
    });

    const { GET } = await import("@/app/api/reports/export/route");
    const response = await GET(new Request("http://localhost:3000/api/reports/export?format=pdf&period=last"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header.startsWith("%PDF")).toBe(true);
  });

  it("returns recoverable error when selected period has no transactions", async () => {
    const transactions = buildTransactionsBuilder({ data: [], error: null });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => transactions.builder),
    });

    const { GET } = await import("@/app/api/reports/export/route");
    const response = await GET(new Request("http://localhost:3000/api/reports/export?format=csv&period=month"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No transactions found for the selected period. Adjust the period and retry.",
    });
  });

  it("returns clear input error for unsupported format", async () => {
    const { GET } = await import("@/app/api/reports/export/route");
    const response = await GET(new Request("http://localhost:3000/api/reports/export?format=xlsx&period=this"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Export format must be csv or pdf.",
    });
  });
});