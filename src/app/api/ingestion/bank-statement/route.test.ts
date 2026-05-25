import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceServerSecretPolicyMock = vi.fn();
const logAuditEventMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const importBankStatementForUserMock = vi.fn();

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/ingestion/bank-statements", () => ({
  importBankStatementForUser: (...args: unknown[]) => importBankStatementForUserMock(...args),
}));

function makeAuthenticatedSupabase(userId = "user-1") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
  };
}

function makeUnauthenticatedSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  };
}

function makeMultipartRequest(file?: File) {
  const formData = new FormData();
  if (file) formData.append("statement", file);
  return new Request("http://localhost:3000/api/ingestion/bank-statement", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/ingestion/bank-statement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 when content-type is not multipart/form-data", async () => {
    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/bank-statement", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("rejected");
    expect(body.error.code).toBe("INVALID_CONTENT_TYPE");
    expect(body.error.retryable).toBe(false);
  });

  it("returns 401 for unauthenticated requests", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeUnauthenticatedSupabase());

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(makeMultipartRequest(new File([""], "s.pdf")));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "financial_document_upload_denied" }),
    );
  });

  it("returns 400 when no file is attached", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase());

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    // Send multipart but without a 'statement' field
    const formData = new FormData();
    formData.append("other", "value");
    const response = await POST(
      new Request("http://localhost:3000/api/ingestion/bank-statement", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("rejected");
    expect(body.error.code).toBe("MISSING_FILE");
  });

  it("returns 201 for a new (non-deduplicated) successful import", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase());
    importBankStatementForUserMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      document: { id: "doc-1" },
    });

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      makeMultipartRequest(new File(["pdf bytes"], "statement.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("accepted");
    expect(body.deduplicated).toBe(false);
    expect(body.document).toEqual({ id: "doc-1" });
  });

  it("returns 200 for a deduplicated import", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase());
    importBankStatementForUserMock.mockResolvedValue({
      ok: true,
      deduplicated: true,
      document: { id: "doc-2" },
    });

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      makeMultipartRequest(new File(["pdf bytes"], "statement.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("accepted");
    expect(body.deduplicated).toBe(true);
  });

  it("returns 422 for a non-retryable import failure", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase("u-2"));
    importBankStatementForUserMock.mockResolvedValue({
      ok: false,
      code: "UNSUPPORTED_FORMAT",
      message: "Only PDF or CSV statements are supported.",
      retryable: false,
    });

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      makeMultipartRequest(new File(["data"], "statement.xlsx", { type: "application/vnd.ms-excel" })),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.status).toBe("rejected");
    expect(body.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(body.error.retryable).toBe(false);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "financial_document_upload_failed", userId: "u-2" }),
    );
  });

  it("returns 503 for a retryable import failure", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase());
    importBankStatementForUserMock.mockResolvedValue({
      ok: false,
      code: "DOWNSTREAM_UNAVAILABLE",
      message: "Service temporarily unavailable.",
      retryable: true,
    });

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      makeMultipartRequest(new File(["pdf bytes"], "statement.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.retryable).toBe(true);
  });

  it("returns 500 for unexpected errors", async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeAuthenticatedSupabase());
    importBankStatementForUserMock.mockRejectedValue(new Error("DB exploded"));

    const { POST } = await import("@/app/api/ingestion/bank-statement/route");
    const response = await POST(
      makeMultipartRequest(new File(["pdf bytes"], "statement.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe("rejected");
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.retryable).toBe(true);
  });
});
