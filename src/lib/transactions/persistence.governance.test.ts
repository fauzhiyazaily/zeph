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

function buildPersistInput(overrides?: Partial<Parameters<typeof persistTransaction>[1]>) {
  const parsedOverrides = overrides?.parsed ?? {};
  return {
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
      ...parsedOverrides,
    },
    ...overrides,
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
      ...parsedOverrides,
    },
  };
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

  it("rejects malformed amount without issuing a database write", async () => {
    const { supabase } = createSupabaseInsertMock();

    const result = await persistTransaction(supabase as never, buildPersistInput({
      parsed: {
        amount: 0,
      },
    }));

    expect(result).toEqual({
      ok: false,
      code: "INVALID_AMOUNT",
      reason: "Amount must be a positive number.",
      retryable: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects malformed merchant without issuing a database write", async () => {
    const { supabase } = createSupabaseInsertMock();

    const result = await persistTransaction(supabase as never, buildPersistInput({
      parsed: {
        merchant: " ",
      },
    }));

    expect(result).toEqual({
      ok: false,
      code: "INVALID_MERCHANT",
      reason: "Merchant must be 2-120 characters.",
      retryable: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects malformed timestamp without issuing a database write", async () => {
    const { supabase } = createSupabaseInsertMock();

    const result = await persistTransaction(supabase as never, buildPersistInput({
      parsed: {
        timestamp: "not-a-timestamp",
      },
    }));

    expect(result).toEqual({
      ok: false,
      code: "INVALID_TIMESTAMP",
      reason: "Timestamp is invalid.",
      retryable: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns deduplicated transaction on unique-constraint conflict when existing row is found", async () => {
    const duplicateRow = {
      id: "txn-existing",
      user_id: "user-123",
      ingestion_id: "manual:user-123:abc",
      amount: 125.2,
      merchant: "acme bakery",
      source: "bank",
      reference: "R-99",
      date: "2026-05-14T10:00:00.000Z",
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    };

    const duplicateLookupBuilder = {
      select: vi.fn(() => duplicateLookupBuilder),
      eq: vi.fn(() => duplicateLookupBuilder),
      maybeSingle: vi.fn(async () => ({
        data: duplicateRow,
        error: null,
      })),
    };

    const insertBuilder = {
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => insertBuilder),
      single: vi.fn(async () => ({
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      })),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("transactions");
        return supabase.from.mock.calls.length === 1 ? insertBuilder : duplicateLookupBuilder;
      }),
    };

    const result = await persistTransaction(supabase as never, buildPersistInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.deduplicated).toBe(true);
    expect(result.transaction.id).toBe("txn-existing");
    expect(result.transaction.userId).toBe("user-123");
    expect(result.transaction.ingestionId).toBe("manual:user-123:abc");
  });

  it("returns non-retryable DB error when unique conflict cannot resolve to existing row", async () => {
    const duplicateLookupBuilder = {
      select: vi.fn(() => duplicateLookupBuilder),
      eq: vi.fn(() => duplicateLookupBuilder),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: null,
      })),
    };

    const insertBuilder = {
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => insertBuilder),
      single: vi.fn(async () => ({
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      })),
    };

    const supabase = {
      from: vi.fn(() => (supabase.from.mock.calls.length === 1 ? insertBuilder : duplicateLookupBuilder)),
    };

    const result = await persistTransaction(supabase as never, buildPersistInput());

    expect(result).toEqual({
      ok: false,
      code: "23505",
      reason: "duplicate key value violates unique constraint",
      retryable: false,
    });
  });
});
