import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceServerSecretPolicyMock = vi.fn();
const logAuditEventMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const hasMessageReadingConsentMock = vi.fn();
const writeIngestionAuditLogMock = vi.fn();
const writeFailedIngestionRecordMock = vi.fn();
const persistTransactionMock = vi.fn();
const classifyTransactionMock = vi.fn();
const parsePaymentMessageMock = vi.fn();

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/consent", () => ({
  hasMessageReadingConsent: (...args: unknown[]) => hasMessageReadingConsentMock(...args),
}));

vi.mock("@/lib/ingestion/audit-log", () => ({
  writeIngestionAuditLog: (...args: unknown[]) => writeIngestionAuditLogMock(...args),
}));

vi.mock("@/lib/ingestion/dead-letter", () => ({
  writeFailedIngestionRecord: (...args: unknown[]) => writeFailedIngestionRecordMock(...args),
}));

vi.mock("@/lib/transactions/persistence", () => ({
  persistTransaction: (...args: unknown[]) => persistTransactionMock(...args),
}));

vi.mock("@/lib/ai/classification", () => ({
  classifyTransaction: (...args: unknown[]) => classifyTransactionMock(...args),
}));

vi.mock("@/lib/ingestion/payment-message", () => ({
  parsePaymentMessage: (...args: unknown[]) => parsePaymentMessageMock(...args),
}));

describe("POST /api/ingestion/payment-message consent boundary", () => {
  function makeSupabaseClientForAuthenticatedUser() {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: { message_reading_consent: true } } },
        }),
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasMessageReadingConsentMock.mockReturnValue(true);
    writeIngestionAuditLogMock.mockResolvedValue(undefined);
    writeFailedIngestionRecordMock.mockResolvedValue(undefined);
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseClientForAuthenticatedUser());
    classifyTransactionMock.mockResolvedValue({
      ok: true,
      label: "wise",
      reason: "test reason",
      provider: "heuristic",
    });
  });

  it("returns 401 and audits when unauthenticated", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ingestion_denied",
        reason: "unauthenticated",
        route: "/api/ingestion/payment-message",
      }),
    );
  });

  it("returns 403 and audits when consent is inactive", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: {} } },
        }),
      },
    });
    hasMessageReadingConsentMock.mockReturnValue(false);

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Payment message ingestion is blocked because consent is not enabled.",
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ingestion_denied",
        reason: "message_reading_consent_missing",
        route: "/api/ingestion/payment-message",
        userId: "u1",
      }),
    );
  });

  it("accepts a valid parsed payment message and returns normalized transaction payload", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });

    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      transaction: {
        id: "tx-1",
        userId: "u1",
        ingestionId: "ing-1",
        ingestionBatchId: "payment-message:batch-1",
        fingerprint: "abc",
        amount: 120,
        merchant: "Cafe Nero",
        source: "upi",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        createdAt: "2026-05-22T10:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
      },
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "accepted",
        transactionId: "tx-1",
        normalizedTransaction: expect.objectContaining({
          amount: 120,
          merchant: "Cafe Nero",
          source: "upi",
          reference: "UTR123456",
          timestamp: "2026-05-22T10:00:00.000Z",
        }),
      }),
    );

    expect(writeIngestionAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        total_rows: 1,
        valid_rows: 1,
        invalid_rows: 0,
      }),
    );
  });

  it("logs non-retryable parse failures and returns 422", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "payment received" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "PARSE_FAILED",
          retryable: false,
        }),
      }),
    );

    expect(writeFailedIngestionRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "Could not parse amount from payment message.",
        retryable: false,
      }),
    );
  });

  it("logs retryable parse failures and returns 503", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: false,
      reason: "Temporary parser backend timeout.",
      retryable: true,
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 450 debited" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "PARSE_FAILED",
          retryable: true,
        }),
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ingestion_parse_failed",
        reason: "Temporary parser backend timeout.",
      }),
    );
  });

  it("does not cache retryable parse failures", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: false,
      reason: "Temporary parser backend timeout.",
      retryable: true,
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const request = new Request("http://localhost:3000/api/ingestion/payment-message", {
      method: "POST",
      body: JSON.stringify({ message: "Rs 450 debited" }),
    });

    const first = await POST(request.clone());
    expect(first.status).toBe(503);

    const retried = await POST(request.clone());
    expect(retried.status).toBe(503);
    await expect(retried.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          retryable: true,
        }),
      }),
    );
    expect(parsePaymentMessageMock).toHaveBeenCalledTimes(2);
  });

  it("does not deduplicate across different users with the same message id header", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });

    persistTransactionMock
      .mockResolvedValueOnce({
        ok: true,
        deduplicated: false,
        transaction: {
          id: "tx-u1",
          userId: "u1",
          ingestionId: "ing-u1",
          ingestionBatchId: "payment-message:batch-1",
          fingerprint: "abc",
          amount: 120,
          merchant: "Cafe Nero",
          source: "upi",
          reference: "UTR123456",
          timestamp: "2026-05-22T10:00:00.000Z",
          createdAt: "2026-05-22T10:00:00.000Z",
          updatedAt: "2026-05-22T10:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        deduplicated: false,
        transaction: {
          id: "tx-u2",
          userId: "u2",
          ingestionId: "ing-u2",
          ingestionBatchId: "payment-message:batch-1",
          fingerprint: "def",
          amount: 120,
          merchant: "Cafe Nero",
          source: "upi",
          reference: "UTR123456",
          timestamp: "2026-05-22T10:00:00.000Z",
          createdAt: "2026-05-22T10:00:00.000Z",
          updatedAt: "2026-05-22T10:00:00.000Z",
        },
      });

    createServerSupabaseClientMock
      .mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "u1", user_metadata: { message_reading_consent: true } } },
          }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      })
      .mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "u2", user_metadata: { message_reading_consent: true } } },
          }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const first = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        headers: { "x-message-id": "same-id-cross-user" },
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    const second = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        headers: { "x-message-id": "same-id-cross-user" },
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    await expect(first.json()).resolves.toEqual(
      expect.objectContaining({
        deduplicated: false,
        transactionId: "tx-u1",
      }),
    );
    await expect(second.json()).resolves.toEqual(
      expect.objectContaining({
        deduplicated: false,
        transactionId: "tx-u2",
      }),
    );
  });

  it("does not deduplicate when same user reuses message id header with different payload", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });

    persistTransactionMock
      .mockResolvedValueOnce({
        ok: true,
        deduplicated: false,
        transaction: {
          id: "tx-one",
          userId: "u1",
          ingestionId: "ing-one",
          ingestionBatchId: "payment-message:batch-1",
          fingerprint: "abc",
          amount: 120,
          merchant: "Cafe Nero",
          source: "upi",
          reference: "UTR123456",
          timestamp: "2026-05-22T10:00:00.000Z",
          createdAt: "2026-05-22T10:00:00.000Z",
          updatedAt: "2026-05-22T10:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        deduplicated: false,
        transaction: {
          id: "tx-two",
          userId: "u1",
          ingestionId: "ing-two",
          ingestionBatchId: "payment-message:batch-1",
          fingerprint: "def",
          amount: 120,
          merchant: "Cafe Nero",
          source: "upi",
          reference: "UTR123456",
          timestamp: "2026-05-22T10:00:00.000Z",
          createdAt: "2026-05-22T10:00:00.000Z",
          updatedAt: "2026-05-22T10:00:00.000Z",
        },
      });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const first = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        headers: { "x-message-id": "same-id" },
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    const second = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        headers: { "x-message-id": "same-id-payload-variance" },
        body: JSON.stringify({ message: "Rs 999 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    await expect(first.json()).resolves.toEqual(
      expect.objectContaining({
        deduplicated: false,
        transactionId: "tx-one",
      }),
    );
    await expect(second.json()).resolves.toEqual(
      expect.objectContaining({
        deduplicated: false,
        transactionId: "tx-two",
      }),
    );
  });

  it("returns 400 for array payloads", async () => {
    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify(["unexpected"]),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "INVALID_PAYLOAD",
        }),
      }),
    );
  });

  it("returns 400 when message is missing or not a non-empty string", async () => {
    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const invalidBodies = [{}, { message: 42 }, { message: "   " }];

    for (const body of invalidBodies) {
      const response = await POST(
        new Request("http://localhost:3000/api/ingestion/payment-message", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          status: "rejected",
          error: expect.objectContaining({
            code: "INVALID_PAYLOAD",
          }),
        }),
      );
    }
  });

  it("does not update transaction AI fields when persistence is deduplicated", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: { message_reading_consent: true } } },
        }),
      },
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    });

    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });

    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: true,
      transaction: {
        id: "tx-existing",
        userId: "u1",
        ingestionId: "ing-existing",
        ingestionBatchId: "payment-message:batch-1",
        fingerprint: "abc",
        amount: 120,
        merchant: "Cafe Nero",
        source: "upi",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        createdAt: "2026-05-22T10:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
      },
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        deduplicated: true,
        transactionId: "tx-existing",
      }),
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("preserves retry-safe parse failure responses even when audit sinks fail", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: false,
      reason: "Temporary parser backend timeout.",
      retryable: true,
    });
    writeIngestionAuditLogMock.mockRejectedValue(new Error("audit sink down"));
    writeFailedIngestionRecordMock.mockRejectedValue(new Error("dead letter sink down"));

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 450 debited" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "PARSE_FAILED",
          retryable: true,
        }),
      }),
    );
  });

  it("returns 503 when parser throws unexpectedly", async () => {
    parsePaymentMessageMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "PARSE_EXCEPTION",
          retryable: true,
        }),
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ingestion_parse_failed",
        reason: "parser_exception",
      }),
    );
    expect(writeIngestionAuditLogMock).toHaveBeenCalled();
    expect(writeFailedIngestionRecordMock).toHaveBeenCalled();
  });

  it("maps malformed provider messages to 422 non-retryable webhook rejections", async () => {
    const { parsePaymentMessage: realParsePaymentMessage } =
      await vi.importActual<typeof import("@/lib/ingestion/payment-message")>(
        "@/lib/ingestion/payment-message",
      );

    parsePaymentMessageMock.mockImplementation((input: unknown) =>
      realParsePaymentMessage(input as { message: string; receivedAt?: string; sourceHint?: string }),
    );

    const malformedProviderMessages = [
      "HDFC Bank: debited from a/c XX1234 on 22-05-26 to ZOMATO via UPI Ref no 63411928371",
      "SBI: spent on your debit card at AMAZON SELLER SERVICES txn id 91AF74K2 on 22/05/2026 09:12",
      "ICICI Bank: credited to your account from ACME PAYROLL on 22/05/2026 UTR: N32519A7B1",
      "PhonePe alert: paid to SWIGGY using wallet on 22/05/2026. Transaction ID: T2026PP778811",
      "GPay: You paid to MYNTRA@okaxis via UPI. UTR 206653771123. 22/05/2026 18:45",
    ];

    const { POST } = await import("@/app/api/ingestion/payment-message/route");

    for (const message of malformedProviderMessages) {
      const response = await POST(
        new Request("http://localhost:3000/api/ingestion/payment-message", {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          status: "rejected",
          error: expect.objectContaining({
            code: "PARSE_FAILED",
            retryable: false,
          }),
        }),
      );
    }

    expect(writeFailedIngestionRecordMock).toHaveBeenCalledTimes(malformedProviderMessages.length);
  });

  it("maps provider-family transient parse failures to 503 retryable webhook rejections", async () => {
    const transientProviderMessages = [
      "HDFC transient parser issue payload",
      "SBI transient parser issue payload",
      "ICICI transient parser issue payload",
      "PhonePe transient parser issue payload",
      "GPay transient parser issue payload",
    ];

    parsePaymentMessageMock.mockReturnValue({
      ok: false,
      reason: "Temporary parser backend timeout.",
      retryable: true,
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");

    for (const message of transientProviderMessages) {
      const response = await POST(
        new Request("http://localhost:3000/api/ingestion/payment-message", {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          status: "rejected",
          error: expect.objectContaining({
            code: "PARSE_FAILED",
            retryable: true,
          }),
        }),
      );
    }

    expect(writeFailedIngestionRecordMock).toHaveBeenCalledTimes(transientProviderMessages.length);
  });

  it("returns 503 and logs failure when persistence throws", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });
    persistTransactionMock.mockRejectedValue(new Error("db down"));

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "PERSIST_EXCEPTION",
          retryable: true,
        }),
      }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ingestion_persist_failed",
        reason: "persist_exception",
      }),
    );
    expect(writeFailedIngestionRecordMock).toHaveBeenCalled();
  });

  it("maps persistence retryable and non-retryable failures to 503/422", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });
    persistTransactionMock
      .mockResolvedValueOnce({
        ok: false,
        code: "PERSIST_FAILED",
        reason: "constraint",
        retryable: false,
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "PERSIST_FAILED",
        reason: "transient",
        retryable: true,
      });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const nonRetryable = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );
    const retryable = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 121 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(nonRetryable.status).toBe(422);
    expect(retryable.status).toBe(503);
  });

  it("returns accepted payload and logs when classification fails", async () => {
    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 120,
        currency: "INR",
        merchant: "Cafe Nero",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 120 paid to cafe via upi",
      },
    });
    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      transaction: {
        id: "tx-1",
        userId: "u1",
        ingestionId: "ing-1",
        ingestionBatchId: "payment-message:batch-1",
        fingerprint: "abc",
        amount: 120,
        merchant: "Cafe Nero",
        source: "upi",
        reference: "UTR123456",
        timestamp: "2026-05-22T10:00:00.000Z",
        createdAt: "2026-05-22T10:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
      },
    });
    classifyTransactionMock.mockResolvedValue({
      ok: false,
      reason: "classification timeout",
      retryable: true,
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 120 paid to cafe via upi on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(202);
    const json = await response.json();
    expect(json).toEqual(
      expect.objectContaining({
        status: "accepted",
      }),
    );
    expect(json).not.toHaveProperty("aiClassification");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "classification_failed",
        reason: "classification timeout",
      }),
    );
  });

  it("triggers classification for newly persisted transactions and returns label + rationale", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: { message_reading_consent: true } } },
        }),
      },
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    });

    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 320,
        currency: "INR",
        merchant: "Fresh Mart",
        source: "upi",
        source_type: "upi",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-1",
        ingested_at: "2026-05-22T10:00:00.000Z",
        normalized_at: "2026-05-22T10:00:00.000Z",
        fingerprint: "abc",
        reference: "UTR778899",
        timestamp: "2026-05-22T10:00:00.000Z",
        rawMessage: "Rs 320 paid to fresh mart via upi",
      },
    });

    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      transaction: {
        id: "tx-3-1",
        userId: "u1",
        ingestionId: "ing-3-1",
        ingestionBatchId: "payment-message:batch-1",
        fingerprint: "abc",
        amount: 320,
        merchant: "Fresh Mart",
        source: "upi",
        reference: "UTR778899",
        timestamp: "2026-05-22T10:00:00.000Z",
        createdAt: "2026-05-22T10:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
      },
    });

    classifyTransactionMock.mockResolvedValue({
      ok: true,
      label: "wise",
      reason: "Essential spend with clear value.",
      provider: "anthropic",
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 320 paid to fresh mart via upi on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "accepted",
        aiClassification: {
          label: "wise",
          reason: "Essential spend with clear value.",
          provider: "anthropic",
        },
      }),
    );
    expect(classifyTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: "Fresh Mart",
        amount: 320,
        source: "upi",
        reference: "UTR778899",
      }),
    );
    expect(updateMock).toHaveBeenCalled();
  });

  it("degrades gracefully when classification write fails and keeps transaction visible", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: "classification write failed" } }),
      }),
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: { message_reading_consent: true } } },
        }),
      },
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    });

    parsePaymentMessageMock.mockReturnValue({
      ok: true,
      data: {
        amount: 510,
        currency: "INR",
        merchant: "Online Store",
        source: "card",
        source_type: "card",
        source_version: "1.0.0",
        ingestion_schema_version: "v1",
        ingestion_pipeline_version: "1.0.0",
        ingestion_batch_id: "payment-message:batch-2",
        ingested_at: "2026-05-22T11:00:00.000Z",
        normalized_at: "2026-05-22T11:00:00.000Z",
        fingerprint: "def",
        reference: "TXN4455",
        timestamp: "2026-05-22T11:00:00.000Z",
        rawMessage: "Rs 510 spent at online store",
      },
    });

    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      transaction: {
        id: "tx-3-1-fallback",
        userId: "u1",
        ingestionId: "ing-3-1-fallback",
        ingestionBatchId: "payment-message:batch-2",
        fingerprint: "def",
        amount: 510,
        merchant: "Online Store",
        source: "card",
        reference: "TXN4455",
        timestamp: "2026-05-22T11:00:00.000Z",
        createdAt: "2026-05-22T11:00:00.000Z",
        updatedAt: "2026-05-22T11:00:00.000Z",
      },
    });

    classifyTransactionMock.mockResolvedValue({
      ok: true,
      label: "useless",
      reason: "Potentially discretionary spend.",
      provider: "heuristic",
    });

    const { POST } = await import("@/app/api/ingestion/payment-message/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/payment-message", {
        method: "POST",
        body: JSON.stringify({ message: "Rs 510 spent at online store on 22/05/2026" }),
      }),
    );

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        status: "accepted",
        transactionId: "tx-3-1-fallback",
      }),
    );
    expect(payload).not.toHaveProperty("aiClassification");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "classification_persist_failed",
        reason: "classification write failed",
      }),
    );
  });
});
