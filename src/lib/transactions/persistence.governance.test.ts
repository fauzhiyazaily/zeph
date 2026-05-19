import { describe, expect, it, vi } from "vitest";
import { persistTransaction } from "@/lib/transactions/persistence";

function createSupabaseInsertMock() {
  let insertedRow: Record<string, unknown> | null = null;

  const queryBuilder = {
    insert: vi.fn((row: Record<string, unknown>) => {
      insertedRow = row;
      return queryBuilder;
    }),
    select: vi.fn(() => queryBuilder),
    single: vi.fn(async () => ({
      data: {
        id: "txn-1",
        user_id: String(insertedRow?.user_id ?? "user-1"),
        ingestion_id: String(insertedRow?.ingestion_id ?? "ing-1"),
        amount: Number(insertedRow?.amount ?? 0),
        merchant: String(insertedRow?.merchant ?? ""),
        source: String(insertedRow?.source ?? ""),
        reference: (insertedRow?.reference as string | null) ?? null,
        date: String(insertedRow?.date ?? ""),
        created_at: "2026-05-15T00:00:00.000Z",
        updated_at: "2026-05-15T00:00:00.000Z",
      },
      error: null,
    })),
  };

  const supabase = {
    from: vi.fn(() => queryBuilder),
  };

  return { supabase, getInsertedRow: () => insertedRow };
}

describe("@governance persistTransaction ingestion governance", () => {
  it("persists canonical normalized rows and keeps governance metadata", async () => {
    const { supabase, getInsertedRow } = createSupabaseInsertMock();

    const result = await persistTransaction(supabase as never, {
      userId: "user-123",
      ingestionId: "manual:user-123:abc",
      parsed: {
        merchant: "  ACME   BAKERY ",
        amount: 125.2,
        source: "bank",
        source_version: "1.0.0",
        reference: " R-99 ",
        category: "Food",
        financial_document_id: "doc-001",
        timestamp: "2026-05-14T10:00:00.000Z",
        ingestion_batch_id: "batch:manual:1",
        ingested_at: "2026-05-14T10:00:01.000Z",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const row = getInsertedRow();
    expect(row).not.toBeNull();
    expect(row?.merchant).toBe("acme bakery");
    expect(row?.amount).toBe(125.2);
    expect(row?.source).toBe("bank");
    expect(row?.category).toBe("Food");
    expect(row?.financial_document_id).toBe("doc-001");
    expect(row?.ingestion_id).toBe("manual:user-123:abc");
    expect(result.transaction.merchant).toBe("acme bakery");
  });
});
